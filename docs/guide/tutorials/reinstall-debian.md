---
title: 系统重装 Debian 12
---

# 系统重装 Debian 12

这篇适合在刚拿到 Po0 机器后，把系统重装成干净 Debian 12。重装系统有风险，操作前请确认你能通过商家面板或救援方式恢复机器。

## 适用场景

- 初始系统不干净，想重装成纯净 Debian；
- 后续要统一按教程配置 nftables、监控和面板；
- 希望使用固定 SSH 端口、固定密码或密钥重新初始化系统。

## 准备信息

开始前先记录：

- Po0 公网 IP；
- Po0 内网 IP；
- 当前 SSH 登录方式；
- 准备设置的新 SSH 端口；
- 准备设置的新 root 密码或密钥登录方式。

如果你不确定内网 IP，不要乱填静态网络参数，先在系统里确认网卡信息。

## 下载 DD 脚本

社区教程中使用的是 `InstallNET.sh`：

```bash
wget https://raw.githubusercontent.com/leitbogioro/Tools/master/Linux_reinstall/InstallNET.sh
chmod +x InstallNET.sh
```

如果服务器无法直接访问 GitHub，可以先在本地下载后上传到 VPS。

## 执行重装命令

下面是按社区教程整理的 Debian 12 重装命令。请把 `SSH密码` 和 `SSH端口` 换成自己的值。

```bash
sed -i "/\${ChangeBashrc}/i ChangeBashrc=" InstallNET.sh && bash InstallNET.sh \
--network "static" \
-timezone "Asia/Shanghai" \
-debian 12 \
--ip-dns "183.60.83.19" \
-mirror "http://mirrors.tencentyun.com/debian" \
-pwd 'SSH密码' \
-port "SSH端口"
```

参数含义：

| 参数 | 作用 |
| --- | --- |
| `--network "static"` | 使用静态网络配置 |
| `-timezone "Asia/Shanghai"` | 设置时区为上海 |
| `-debian 12` | 安装 Debian 12 |
| `--ip-dns "183.60.83.19"` | 使用 DNS |
| `-mirror "http://mirrors.tencentyun.com/debian"` | 使用腾讯云内网 Debian 镜像源 |
| `-pwd` | 设置新系统 SSH 密码 |
| `-port` | 设置新系统 SSH 端口 |

## 等待安装完成

脚本执行后，请注意终端最后输出的信息，尤其是随机密码、SSH 端口和重启提示。

一般流程：

1. 脚本写入重装配置；
2. 手动重启服务器；
3. 等待系统自动安装；
4. 约 5-10 分钟后尝试用新端口登录。

## 登录后检查

重装完成后先检查系统版本：

```bash
cat /etc/os-release
uname -a
```

确认网络：

```bash
ip addr
ip route
ping -c 4 1.1.1.1
```

确认 SSH 端口：

```bash
ss -lntp | grep ssh
```

## 注意事项

- DD 系统有断联风险，操作前务必确认你知道如何救援。
- 不要照抄别人的 IP、网关、内网地址。
- 如果安装后无法登录，优先通过商家控制台检查 VNC / 救援模式。
- 重装完成后建议立刻做 SSH 安全加固。

## 来源与感谢

本文根据 NodeSeek 公开教程 `🚀 PortChannel Zero 腾讯云 BGP (广州/上海) 测评` 中的一键 DD 部分整理改写，感谢原作者分享实践经验。
