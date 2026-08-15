# 5GPN 是什么 · 适合谁

5gpn-NEXT 是一个部署在 KFCHOST 机器上的**服务端智能分流网关**，基于 KFCHOST 的 5GPN 内网卡链路：手机流量经运营商定向内网到达网关，由网关完成「国内直连、国外走节点」的分流。

手机端**不需要安装任何客户端**：

- 🍎 **iPhone / iPad**（iOS 17+）：安装一张系统描述文件
- 🤖 **Android**（9+）：系统设置里填一个「私人 DNS」域名

没有 Clash，没有 Surge，没有 VPN 图标，没有 tun。

## 它解决什么问题

传统「DNS 劫持 + SNI 嗅探」网关有一串结构性痛点：AAAA 必须置空、QUIC 只能强拒、WhatsApp 要专门打补丁、运营商换网段就全挂。

5gpn-NEXT 从入口层面解决：

| 接入方式 | 原理 | 特点 |
| :-- | :-- | :-- |
| iOS 蜂窝 DNS 模式 | 加密 DNS（DoT）+ GEOIP 分流 | 仅蜂窝生效，Wi-Fi 零影响 |
| iOS Relay 模式 | Apple 原生 Network Relay | 客户端主动携带目的地，协议覆盖最完整 |
| Android 私人 DNS | DoT + A 记录改写 | 系统级，无需安装应用 |

## 适合谁

- 已经在用（或准备用）KFCHOST 5GPN 内网卡的用户
- 希望手机保持「干净」：不装代理 App、不常驻 VPN 图标
- 家庭 Wi-Fi 不想受任何影响（选蜂窝 DNS 模式）
- 想要服务端统一管理分流规则和出口的用户

## ⚠️ 使用前提（缺一不可）

1. **VPS 仅支持 KFC 网段**：网关必须部署在 KFCHOST 的机器/网段上，内网卡流量才能到达；其他任意厂商的 VPS 目前不可用
2. **仅支持浙江联通卡**：5GPN 内网卡目前仅支持浙江联通，且需要**自行办理**，办卡后在 KFCHOST 控制台绑定
3. **一个自有域名**：用于签发 TLS 证书与手机接入入口，需要能自行修改 DNS 解析记录

满足以上条件，请继续阅读[准备工作](/guide/5gpn/prerequisites)。

## 开源

项目开源于 GitHub：[kelenetwork/5gpn-next](https://github.com/kelenetwork/5gpn-next)（MIT License），单个 Go 二进制部署，常驻内存约 26 MB。
