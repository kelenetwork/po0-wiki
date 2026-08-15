# 准备工作

部署前请逐项确认。任何一项不满足，都可能表现为描述文件能安装、但蜂窝网络无法访问网关。

## 1. KFCHOST 机器（必须）

网关必须部署在 **KFCHOST 的机器 / 网段**上。5GPN 内网卡流量由运营商定向送达该网段，其他厂商 VPS 目前收不到这条链路。

| 项目 | 最低要求 | 建议 |
| :-- | :-- | :-- |
| 系统 | Debian 12+ / Ubuntu 22.04+ | Debian 12 |
| 内存 | 512 MB | 1 GB |
| 架构 | amd64 / arm64 | amd64 |
| 权限 | root 或可使用 sudo | root |

网关本体是单个静态 Go 二进制，512 MB 内存机器即可运行。

## 2. 浙江联通 5GPN 卡（必须，自行办理）

- 目前仅支持**浙江联通**卡
- 需要自行办理，并在 KFCHOST 控制台完成绑定
- 绑定成功后，手机使用该卡蜂窝数据即可通过内网链路访问网关
- 移动、电信与其他省份联通卡目前不可用

## 3. 自有域名（必须）

域名同时用于可信 TLS 证书、iOS 描述文件与 Android 私人 DNS：

1. 添加 A 记录，指向 KFC 机器公网 IPv4
2. 如果使用 Cloudflare DNS，选择**仅 DNS / 灰云**
3. 首次申请 Let's Encrypt 证书时，公网 TCP/80 需要可达
4. 不要让 CDN 或反向代理接管该域名；它们不能代替 DoT 853 与网关非标准 HTTPS 端口

安装前可检查：

```bash
getent ahostsv4 gw.example.com
```

返回地址应与 KFC 机器公网 IPv4 一致。

## 4. 网络与端口

安装器会自动创建 nftables 规则，但云厂商安全组仍需允许必要流量：

- 公网 TCP/80：首次申请或续期 HTTP-01 证书
- 5GPN 客户端网段 → TCP/853：DoT
- 5GPN 客户端网段 → 网关配置的 HTTPS / 接管端口
- 服务器 → DNS 上游、GitHub Release、规则源与可选落地节点

接管端口和内网 Web 面板**不要向公网全开放**。

## 5. 落地节点（可选）

如果国外流量不希望使用 KFC 机器公网 IP，可以准备节点分享链接：

```text
ss:// vless:// vmess:// trojan:// hysteria2:// tuic:// socks5:// http://
```

安装时粘贴，或安装后通过 Bot / 内网面板添加。切换国外出口前，系统会先做真实端到端验证。

## 6. Telegram Bot（可选，推荐）

准备：

- 从 `@BotFather` 创建的 Bot Token
- 管理员 Telegram 数字 ID

Bot 可管理出口、规则、广告拦截、白名单、客户端接入、逐层诊断、升级和回退。Token 与节点链接都属于敏感凭据，不要提交到 Git 或粘贴到公开 Issue。

---

全部就绪后，进入[一键安装部署](/guide/5gpn/install)。
