---
title: 挂载 Nyanpass 面板
---

# 挂载 Nyanpass 面板

Po0 机器访问海外资源可能受限，挂载 Nyanpass 面板时通常需要通过代理完成安装和后续通信。

## 准备信息

你需要准备：

- Nyanpass 面板后台生成的 Agent 安装命令；
- 可用代理信息；
- Po0 SSH 登录权限；
- 如果使用 Shadowsocks 代理，需要准备 SS 链接信息。

## 1. 设置临时 HTTP 代理

先让当前 Shell 能顺利下载安装包：

```bash
export http_proxy="http://用户名:密码@代理IP:代理端口"
export https_proxy=$http_proxy
export HTTP_PROXY=$http_proxy
export HTTPS_PROXY=$http_proxy
```

测试访问：

```bash
curl -I https://你的面板域名
```

## 2. 执行 Nyanpass Agent 安装命令

去 Nyanpass 面板后台复制安装命令，在 Po0 上执行。

安装完成后，重点配置持久代理，否则当前 Shell 的临时代理取消后，Agent 可能会掉线。

## 3. 配置持久化代理

Nyanpass 常见做法是修改：

```bash
/opt/nyanpass/env.sh
```

编辑文件：

```bash
nano /opt/nyanpass/env.sh
```

写入代理信息。社区教程中使用 SS 代理示例：

```bash
export NYA_PROXY="ss://aes-128-gcm:你的密码@代理IP:代理端口/"
```

请把密码、IP、端口和加密方式换成自己的实际信息。

## 4. 清理临时代理并重启服务

```bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY
systemctl daemon-reload
systemctl restart nyanpass.service
systemctl status nyanpass.service --no-pager
```

如果服务名不是 `nyanpass.service`，用下面命令查找：

```bash
systemctl list-units | grep -i nyan
```

## 5. 检查是否在线

- 面板中查看节点是否 online；
- 查看服务日志；
- 确认 `env.sh` 中代理配置没有写错；
- 确认代理本身可用。

日志命令：

```bash
journalctl -u nyanpass.service -n 100 --no-pager
```

## 注意事项

- 临时代理只对当前 Shell 生效，服务长期运行必须写持久化配置。
- 不要把代理密码公开发到群里或截图里。
- 如果挂载失败，优先检查代理是否可用，再检查面板安装命令。

## 来源与感谢

本文根据 NodeSeek 公开教程 `🚀 PortChannel Zero 腾讯云 BGP (广州/上海) 测评` 中 Nyanpass 面板挂载部分整理改写，感谢原作者分享实践经验。
