# 一键安装部署

> 开始前请确认已满足[准备工作](/guide/5gpn/prerequisites)：KFC 网段机器、已绑定的浙江联通 5GPN 卡，以及已解析到机器的自有域名。

## 一条命令安装

在 KFC 机器上执行：

```bash
curl -fsSL https://raw.githubusercontent.com/kelenetwork/5gpn-next/main/install.sh | sudo bash
```

安装器会优先下载 GitHub Latest Release 的对应架构二进制；若暂时没有 Release，才会尝试从源码构建。

## 安装时会询问什么

| 询问项 | 说明 | 可否留空 |
| :-- | :-- | :-- |
| 网关域名 | 已解析到本机的域名，例如 `gw.example.com` | 必填 |
| 证书邮箱 | Let's Encrypt 到期通知邮箱 | 可留空 |
| 落地节点链接 | `ss://` 等分享链接，安装后也能添加 | 可留空 |
| Telegram Bot Token | 用于聊天窗口管理 | 可留空 |
| 管理员 Telegram ID | 你的数字 ID | 配置 Bot 时必填 |

## 安装器会做什么

1. 下载并安装 `5gpnd`
2. 申请或复用 Let's Encrypt 证书
3. 可选部署 mihomo 出口
4. 写入 `/etc/5gpn-next/config.json`
5. 创建 systemd 服务
6. 创建 nftables 规则，只允许 `client_cidr` 访问接管端口和内网面板
7. 生成 iOS 蜂窝 DNS 描述文件及随机下载路径
8. 启动服务并做配置自检

安装完成后会输出：

- iOS 描述文件下载链接
- 内网 Web 面板地址
- systemd 服务状态与基础验收提示

## 安装后验收

```bash
# 版本
5gpnd version

# 配置静态校验
5gpnd check -c /etc/5gpn-next/config.json

# 服务状态
systemctl status 5gpn-next --no-pager

# 端到端逐层诊断
5gpnd probe -c /etc/5gpn-next/config.json youtube.com
```

`probe` 会输出「入口 → 策略 → 出口 → 连接 → 应用」五层结果，失败时直接指出具体层级。

## 开启广告拦截

广告拦截默认关闭。确认基础分流正常后，再从以下任一入口开启：

- Telegram Bot → **广告拦截** → **开启拦截**
- 内网 Web 面板 → **广告拦截** → 切换开关

首次开启会下载约 2 MB 的 anti-AD 规则。规则载入后，Bot / Web 会显示有效域名条数；产生真实命中后，还会显示今日、累计、最近记录和高频域名。

## 重装与升级

- **重装**：重跑安装脚本。脚本会尽量沿用现有配置、随机下载路径与鉴权信息
- **升级**：优先使用 Bot「版本更新」，下载后校验 SHA256；启动失败会自动回退旧二进制
- **手动检查**：升级后执行 `5gpnd version` 和一次真实 `probe`

### 从 v0.12.5 及更早版本升级

服务端升级完成后，还需要一次客户端清理：

1. 删除旧的 iOS 5gpn 描述文件
2. 从 Bot 重新获取当前蜂窝 DNS 描述文件并安装
3. 在「设置 → 通用 → 关于本机 → 证书信任设置」确认没有遗留的 `5gpn-NEXT` 根证书

当前版本不下发根证书，也不修改系统定位。

## 卸载

```bash
curl -fsSL https://raw.githubusercontent.com/kelenetwork/5gpn-next/main/uninstall.sh | sudo bash
```

追加 `--purge` 会一并删除配置、规则缓存与运行数据；执行前请自行备份需要保留的配置。

---

装好后，继续阅读 [iOS 接入](/guide/5gpn/ios) 或 [Android 接入](/guide/5gpn/android)。
