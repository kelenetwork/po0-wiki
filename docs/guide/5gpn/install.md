# 一键安装部署

> 开始前请确认已满足[准备工作](/guide/5gpn/prerequisites)中的全部条件，尤其是：机器在 KFC 网段、浙江联通卡已绑定、域名 A 记录已指向机器。

## 一条命令安装

在 KFC 机器上以 root 执行：

```bash
curl -fsSL https://raw.githubusercontent.com/kelenetwork/5gpn-next/main/install.sh | sudo bash
```

安装脚本会依次询问：

| 询问项 | 说明 | 可否留空 |
| :-- | :-- | :-- |
| 网关域名 | 已解析到本机的域名，如 `gw.example.com` | 必填 |
| 证书邮箱 | Let's Encrypt 通知邮箱 | 可留空 |
| 落地节点链接 | `ss://` 等分享链接，装完也可在 Bot 添加 | 可留空 |
| Telegram Bot Token | 用于聊天窗口管理 | 可留空 |
| 管理员 Telegram ID | 你的数字 ID | 配了 Bot 则必填 |

脚本自动完成：TLS 证书签发、nftables 防火墙（仅放行内网卡网段）、systemd 服务、描述文件生成。装完直接输出 iPhone 描述文件安装链接和内网面板地址。

## 安装后验收

```bash
# 服务状态
systemctl status 5gpn-next

# 端到端逐层诊断
5gpnd probe youtube.com
```

`probe` 会输出「入口 → 策略 → 出口 → 连接 → 应用」五层结果，任何一层失败都会指明原因。

## 重装与升级

- **重装**：重跑安装脚本即可。脚本会沿用既有鉴权 Token 和描述文件下载路径，**已安装的手机描述文件继续有效，无需重装**
- **升级**：优先用 Telegram Bot 的「版本更新」一键升级（SHA256 校验、失败自动回退）；也可重跑安装脚本

## 卸载

```bash
curl -fsSL https://raw.githubusercontent.com/kelenetwork/5gpn-next/main/uninstall.sh | sudo bash
```

追加 `--purge` 一并删除配置与数据。

---

装好后，继续[iOS 接入](/guide/5gpn/ios)或[Android 接入](/guide/5gpn/android)。
