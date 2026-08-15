# 5GPN 是什么 · 适合谁

5gpn-NEXT 是一个部署在 KFCHOST 机器上的**加密 DNS 分流网关**。它利用 KFCHOST 的 5GPN 内网卡链路，让手机无需安装代理 App，也能由服务端统一完成国内直连、国外出口和 DNS 广告拦截。

手机端只使用系统能力：

- 🍎 **iPhone / iPad（iOS 17+）**：安装一张仅蜂窝生效的加密 DNS 描述文件
- 🤖 **Android（9+）**：在系统设置中填写一个私人 DNS 域名

没有代理客户端、没有订阅导入、没有常驻 VPN 图标。当前版本也**不修改系统定位、不安装根证书、不解密 TLS**。

## 工作方式

```text
iPhone 蜂窝 DNS ─┐
                  ├─► DoT 策略决策 ─► 国内目标：返回真实 IP，手机本地直连
Android 私人 DNS ┘                 ├► 国外目标：返回网关 IP，由网关出口转发
                                   └► 广告域名：返回 NXDOMAIN
```

规则按顺序 first-match，命中即停止：

```text
私网保护 → 用户自定义规则 → 广告白名单 → 广告规则 → 国内直连兜底 → FINAL
```

- **国内域名 / GEOIP CN**：返回真实 IP，由手机蜂窝网络直接访问
- **国外目标**：A 记录改写为网关 IP，网关根据 SNI、HTTP Host 或近期 DNS 线索还原目标，再选择本机或 mihomo 出口
- **广告域名**：在 DNS 层直接返回 NXDOMAIN，无需在手机安装额外拦截软件

## 核心能力

| 能力 | 说明 |
| :-- | :-- |
| 服务端分流 | 支持 `DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD`、`IP-CIDR`、`RULE-SET`、`GEOIP` 与 `FINAL` |
| 多出口 | KFC 本机公网，或通过 mihomo 接入 SS / VLESS / VMess / Trojan / Hysteria2 / TUIC 等节点 |
| DNS 广告拦截 | anti-AD 规则、白名单、24 小时刷新、成功次数、最近记录与高频域名统计 |
| Telegram Bot | 查看状态、管理出口与规则、广告拦截、客户端接入、逐层诊断、升级与回退 |
| 内网 Web 面板 | 只允许 5GPN 客户端网段访问，支持状态、出口、规则、拦截记录与白名单管理 |
| 安全更新 | Release SHA256 校验；新二进制启动失败时自动回退 |

## 广告“成功拦截”的含义

5gpn-NEXT 不把“规则命中”直接算作成功。只有 NXDOMAIN 已经**成功写回手机**时，才会累计一次成功拦截。

系统会保存：

- 今日、最近 7 日、最近 30 日与累计次数
- 最近 100 条命中域名和时间
- 最多 400 个域名的聚合排行

不会保存客户端 IP、完整 URL或正常访问明细。误杀时可在 Bot 或内网面板把域名加入白名单，立即放行该域名及其子域。

## 适合谁

- 已经在用或准备办理 KFCHOST 5GPN 内网卡
- 希望手机不安装代理 App、不显示常驻 VPN 图标
- 希望 iPhone 连接 Wi-Fi 后完全停用网关接入
- 希望在服务端统一管理分流、出口与广告拦截
- 愿意接受 DNS 入口的明确协议边界

## 能力边界

1. 网关只能部署在能收到 5GPN 内网卡流量的 KFCHOST 网段。
2. 数据面目前为 IPv4-only；客户端 AAAA / HTTPS / SVCB 查询会返回 NODATA，避免 IPv6 绕过网关。
3. 客户端到网关的 UDP/443 会被拒绝，以促使 QUIC 回落 TCP。
4. 无 SNI、无 HTTP Host，且无法通过近期 DNS 查询可靠关联目标的私有协议可能不兼容。
5. DNS 层无法拦截 App 自带 DoH / DoQ、直接访问 IP 的广告，以及与正常业务共用同一域名的原生广告。

## ⚠️ 使用前提

1. **KFCHOST 机器 / 网段**：其他厂商 VPS 目前收不到这条内网卡流量
2. **浙江联通 5GPN 卡**：需要自行办理，并在 KFCHOST 控制台完成绑定
3. **一个自有域名**：用于可信 TLS 证书与手机接入；DNS 必须直连源站

满足以上条件后，请继续阅读[准备工作](/guide/5gpn/prerequisites)。

## 开源

项目开源于 GitHub：[kelenetwork/5gpn-next](https://github.com/kelenetwork/5gpn-next)，采用 MIT License，以单个 Go 二进制部署。
