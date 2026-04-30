---
title: nftables 手动转发配置
---

# nftables 手动转发配置

这一篇适合不想使用脚本、希望自己维护 `/etc/nftables.conf` 的用户。流程是先准备出口机，再手写 DNAT + SNAT 转发规则，最后把客户端连接地址替换成 Po0。

> 说明：下面是面向普通用户的整理版。不同系统、脚本版本和出口协议可能略有差异，实际操作以你自己的机器信息为准。

## 链路结构

最常见的单层链路：

```text
客户端 → Po0 入口机 → 出口机
```

多层链路：

```text
客户端 → Po0 入口机 → RFC 中转机 → 自备落地机
```

第一次使用建议先跑通单层链路，确认稳定后再做多层。

## 一、先准备出口机

出口机可以是香港、日本或其他你准备作为最终出口的机器。

你需要先完成：

1. 在出口机上搭好代理协议；
2. 记录出口机 IP；
3. 记录协议端口；
4. 在本地客户端直连出口机测试可用。

如果出口机直连都不通，先不要配置 Po0。Po0 只负责把入口流量转过去，不能修复出口机本身的问题。

常见排查点：

- 出口机系统时间是否准确；
- 协议服务是否启动；
- 防火墙是否放行端口；
- 客户端密码、加密方式、端口是否填对。

## 二、初始化 Po0 系统

登录 Po0 后，建议先更新系统：

```bash
apt update
apt upgrade -y
```

然后确认系统允许 IPv4 转发。很多 nftables 管理脚本会自动处理这一步；如果手动配置，需要确认：

```bash
sysctl net.ipv4.ip_forward
```

返回值为 `1` 代表已开启。

## 三、安装 nftables 并开启转发

安装 nftables：

```bash
apt update
apt install -y nftables
```

开启 IPv4 转发：

```bash
cat >/etc/sysctl.d/99-po0-forward.conf <<'EOF'
net.ipv4.ip_forward=1
EOF
sysctl --system
```

确认返回为 `1`：

```bash
sysctl net.ipv4.ip_forward
```

## 四、规划端口转发

添加转发时，通常需要填写三项：

| 项目 | 含义 |
| --- | --- |
| Po0 监听端口 | 客户端最终连接的端口 |
| 出口机 IP | 流量要转发到哪台机器 |
| 出口机端口 | 出口机协议实际监听端口 |

示例：

```text
Po0 监听端口：30001
出口机 IP：203.0.113.10
出口机端口：30001
```

为了方便记忆，Po0 监听端口可以和出口机端口保持一致；但不是必须一致。

## 五、替换客户端配置

假设你原来的客户端配置连接的是：

```text
203.0.113.10:30001
```

配置 Po0 转发后，把客户端里的 IP 改为 Po0 公网 IP：

```text
Po0公网IP:30001
```

协议类型、密码、加密方式等不要乱改。先只替换服务器地址和端口，方便排查。

## 六、多层转发怎么做

如果你要使用自备落地机，常见结构是：

```text
客户端 → Po0 → RFC 中转机 → 自备落地机
```

步骤可以理解成两段转发：

### 1. 落地机先搭好协议

先在自备落地机上搭好协议，并确认直连可用。

记录：

- 落地机 IP；
- 落地机协议端口；
- 客户端配置。

### 2. RFC 中转机转发到落地机

在 RFC 中转机上配置 nftables，把 RFC 中转机的监听端口转发到落地机 IP 和协议端口。

完成后，先把客户端地址临时改成 RFC 中转机 IP 和端口，测试是否可用。

### 3. Po0 再转发到 RFC 中转机

在 Po0 上配置转发，目标填写 RFC 中转机 IP 和端口。

最后客户端连接：

```text
Po0公网IP:Po0监听端口
```

这样就形成：客户端 → Po0 → RFC 中转机 → 落地机。


## 八、配置 `/etc/nftables.conf`

下面是社区教程中最常见的 DNAT + SNAT 思路整理。

### 单出口示例

先编辑配置文件：

```bash
nano /etc/nftables.conf
```

示例配置：

```text
#!/usr/sbin/nft -f

# 按实际情况修改
# 出口机公网 IP
define DEST_IP = 203.0.113.10
# 出口机服务端口
define DEST_PORT_OUT = 30001
# Po0 对外监听端口
define RELAY_PORT_IN = 30001
# Po0 内网 IP，用于让流量走内网互通链路
define RELAY_LAN_IP = 10.100.0.10

flush ruleset

table ip nat {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;

        # 访问 Po0 监听端口的 TCP/UDP 流量，转发到出口机
        meta l4proto { tcp, udp } th dport $RELAY_PORT_IN dnat to $DEST_IP:$DEST_PORT_OUT
    }

    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;

        # 发往出口机的流量，把源地址改为 Po0 内网 IP
        ip daddr $DEST_IP meta l4proto { tcp, udp } th dport $DEST_PORT_OUT snat to $RELAY_LAN_IP
    }
}

table ip filter {
    chain forward {
        type filter hook forward priority 0; policy accept;

        # MSS 调整，减少 MTU 不匹配导致的速度慢或断流
        ip daddr $DEST_IP tcp flags syn tcp option maxseg size set 1452
    }
}
```

其中最容易填错的是 `RELAY_LAN_IP`。它不是客户端连接的公网 IP，而是 Po0 机器用于内网互通的地址。请以商家面板或系统里实际看到的信息为准。

### 多出口示例

如果你要同时转发到香港和日本两个出口，可以为每条线路定义一组端口和目标：

```text
#!/usr/sbin/nft -f

define RELAY_LAN_IP = 10.100.0.10

# 线路 1：香港
define PORT_IN_1 = 30001
define DEST_IP_1 = 203.0.113.10
define DEST_PORT_1 = 30001

# 线路 2：日本
define PORT_IN_2 = 30002
define DEST_IP_2 = 198.51.100.20
define DEST_PORT_2 = 30002

flush ruleset

table ip nat {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;

        meta l4proto { tcp, udp } th dport $PORT_IN_1 dnat to $DEST_IP_1:$DEST_PORT_1
        meta l4proto { tcp, udp } th dport $PORT_IN_2 dnat to $DEST_IP_2:$DEST_PORT_2
    }

    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;

        ip daddr $DEST_IP_1 meta l4proto { tcp, udp } th dport $DEST_PORT_1 snat to $RELAY_LAN_IP
        ip daddr $DEST_IP_2 meta l4proto { tcp, udp } th dport $DEST_PORT_2 snat to $RELAY_LAN_IP
    }
}

table ip filter {
    chain forward {
        type filter hook forward priority 0; policy accept;

        ip daddr { $DEST_IP_1, $DEST_IP_2 } tcp flags syn tcp option maxseg size set 1452
    }
}
```

### 应用配置

写完后先检查语法：

```bash
nft -c -f /etc/nftables.conf
```

没有输出通常代表语法检查通过。然后应用并设置开机自启：

```bash
nft -f /etc/nftables.conf
systemctl enable nftables
systemctl restart nftables
```

客户端配置保持协议、密码、加密方式不变，只把服务器地址和端口改为：

```text
Po0 公网 IP:Po0 监听端口
```

## 九、后续维护

以后要新增、删除或查看端口转发，继续编辑 `/etc/nftables.conf`，然后检查并应用。

常用检查：

```bash
nft -c -f /etc/nftables.conf
nft -f /etc/nftables.conf
nft list ruleset
systemctl status nftables --no-pager
```

如果出现问题，先按这个顺序排查：

1. 出口机或落地机直连是否可用；
2. 中转机转发是否可用；
3. Po0 转发是否可用；
4. 客户端是否已经替换成 Po0 的 IP 和端口；
5. 是否使用了产品默认封禁端口。

## 来源与感谢

本文根据以下公开教程整理改写，感谢原作者分享实践经验：

- NodeSeek：`✨ PortChannel Zero (Po0 腾讯云) — 从开机到配置 nftables 专线转发全流程教程（小白向）`
