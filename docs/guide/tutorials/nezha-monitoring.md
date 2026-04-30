---
title: 安装哪吒监控
---

# 安装哪吒监控

Po0 机器访问海外资源可能受限，直接安装哪吒 Agent 时可能连不上面板或下载失败。社区教程里常见做法是通过 HTTP 代理或 Cloudflare 非标端口解决。

## 方案一：通过 HTTP 代理安装

这是更通用的方式：先让当前 Shell 会话走代理，安装完成后再把代理写入 systemd 服务，保证 Agent 长期在线。

### 1. 设置临时代理

把示例中的账号、密码、IP、端口换成你自己的代理信息：

```bash
export http_proxy="http://用户名:密码@代理IP:代理端口"
export https_proxy=$http_proxy
export HTTP_PROXY=$http_proxy
export HTTPS_PROXY=$http_proxy
```

设置后可以测试：

```bash
curl -I https://你的哪吒面板域名
```

能通再继续安装。

### 2. 执行哪吒后台生成的安装命令

去哪吒面板后台复制 Agent 安装命令，在 Po0 机器上执行。

安装完成后，不要急着关闭代理，先确认服务文件位置。常见路径：

```bash
/etc/systemd/system/nezha-agent.service
```

### 3. 写入持久化代理

编辑服务文件：

```bash
nano /etc/systemd/system/nezha-agent.service
```

在 `[Service]` 段落下方添加：

```ini
Environment="http_proxy=http://用户名:密码@代理IP:代理端口"
Environment="https_proxy=http://用户名:密码@代理IP:代理端口"
Environment="HTTP_PROXY=http://用户名:密码@代理IP:代理端口"
Environment="HTTPS_PROXY=http://用户名:密码@代理IP:代理端口"
Environment="no_proxy=localhost,127.0.0.1,::1,172.31.0.0/16"
Environment="NO_PROXY=localhost,127.0.0.1,::1,172.31.0.0/16"
```

保存后重载并重启：

```bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY
systemctl daemon-reload
systemctl restart nezha-agent.service
systemctl status nezha-agent.service --no-pager
```

## 方案二：Cloudflare 非标端口

如果你的哪吒面板走 Cloudflare，并且支持非标 HTTPS 端口，可以尝试让 Agent 通过非标端口连接。

先确认浏览器能打开：

```text
https://你的面板域名:2096/
```

如果打不开，先检查 Cloudflare、反代和面板配置。

### 配置 custom_ip_api

安装 Agent 后，编辑：

```bash
nano /opt/nezha/agent/config.yml
```

在底部加入：

```yaml
custom_ip_api:
  - "http://ip.sb:8080"
```

然后重启：

```bash
systemctl daemon-reload
systemctl restart nezha-agent.service
systemctl status nezha-agent.service --no-pager
```

### 面板真实 IP 请求头

如果面板走 Cloudflare，哪吒后台可把 Agent 真实 IP 请求头设置为：

```text
CF-Connecting-IP
```

## 排查方法

查看服务日志：

```bash
journalctl -u nezha-agent.service -n 100 --no-pager
```

常见问题：

- 面板域名无法访问；
- 代理账号密码错误；
- systemd 服务里没有写持久化代理；
- Agent 配置文件路径和新版哪吒不一致；
- Cloudflare 非标端口没有正确反代。

## 来源与感谢

本文根据 NodeSeek 公开教程 `🚀 PortChannel Zero 腾讯云 BGP (广州/上海) 测评` 中哪吒探针安装部分整理改写，感谢原作者分享实践经验。
