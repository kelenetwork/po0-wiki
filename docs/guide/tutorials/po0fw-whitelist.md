# 防火墙白名单自动加白（po0fw）

Po0 的「鸡险」增值服务附带防火墙白名单：开启后**只有白名单里的来源 /24 网段才能访问入站端口**。家宽 IP 经常变，手动加白很烦 —— 本教程让设备**自动加白**。

脚本与全部客户端模块开源：[github.com/kelenetwork/po0fw](https://github.com/kelenetwork/po0fw) · iOS/Mac 代理客户端**一键安装页**：[po0fw.uuuz.de](https://po0fw.uuuz.de/)

## 📋 选择你的平台

| 你的设备 | 方案 | 换 IP 后生效速度 | 跳转 |
|---|---|---|---|
| 软路由 OpenWrt / Kwrt ⭐推荐 | 一键脚本 | WAN 重连**秒级** + 10 分钟兜底 | [↓ 安装](#软路由-openwrt--kwrt) |
| Linux / macOS | 一键脚本 | 10 分钟内 | [↓ 安装](#linux--macos) |
| Windows | 一键脚本 | 网络事件即时 + 10 分钟兜底 | [↓ 安装](#windows) |
| 安卓 | MacroDroid 等自动化 App | 切网即时 + 15 分钟兜底 | [↓ 安装](#安卓) |
| iOS/Mac 有代理 App | 脚本模块（Surge/Loon/Stash/QX/小火箭/Egern） | 切网即时 + 10 分钟兜底 | [↓ 安装](#ios) |
| iOS 无代理 App | 快捷指令 | 切 Wi-Fi 即时（无定时） | [↓ 安装](#ios) |

⭐ **家里有软路由的，优先只装软路由**：全家设备连 Wi-Fi 时天然被覆盖，手机只需管出门蜂窝场景。

## 原理（30 秒）

- 客户端定期（+ 网络切换时）向 po0 官方 IP 端点发 `POST https://124.221.69.228/api/firewall/你的token/add`
- 服务端按请求来源识别 **/24 网段**，幂等加白：已在白名单就不占坑、不推进淘汰
- 上限 5 个网段，满了按最早写入 FIFO 淘汰；被挤掉的设备下个周期自动补回（**自愈**）
- 直连官方 IP 不走域名，普通按域名分流的代理不会劫持，**基本无需分流配置**

**获取 token**：po0 控制台 → 机器详情页 →「防火墙」卡片 → 点**复制添加脚本**（不是「添加当前 IP」），里面 `pgnfw_` 开头那串就是。⚠️ token 即加白凭证，勿公开分享；每台机器 token 不同。

## 安装

### 软路由 OpenWrt / Kwrt

```sh
curl -sSL https://raw.githubusercontent.com/kelenetwork/po0fw/main/openwrt/install-openwrt.sh -o /tmp/i.sh
PO0FW_TOKENS="pgnfw_你的token" sh /tmp/i.sh
```

装完自动含：cron 每 10 分钟兜底 + WAN 拨号/重连（hotplug）秒级触发。验证：跑 `po0fw`，日志在 `/tmp/po0fw.log`。

### Linux / macOS

```sh
curl -sSL https://raw.githubusercontent.com/kelenetwork/po0fw/main/install-linux.sh | PO0FW_TOKENS="pgnfw_你的token" sh
```

Linux(root) 注册 systemd timer；macOS / 非 root 写 crontab。

### Windows

管理员 PowerShell：

```powershell
irm https://raw.githubusercontent.com/kelenetwork/po0fw/main/windows/install-windows.ps1 -OutFile i.ps1
powershell -ExecutionPolicy Bypass -File i.ps1 -Tokens "pgnfw_你的token"
```

注册计划任务「po0fw」：每 10 分钟 + 网络连接事件双触发。

### 安卓

安卓代理客户端没有 iOS 那样的脚本引擎，用自动化 App 做，**不依赖代理客户端**。推荐 **MacroDroid**（免 root），建 2 个宏，动作都是 `HTTP 请求`（方法 **POST**，URL `https://124.221.69.228/api/firewall/pgnfw_你的token/add`）：

1. 触发器「网络连接变化」→ 切网即时加白
2. 触发器「定期触发」15 分钟 → **兜底捕捉静默换 IP**（Wi-Fi 没断但公网 IP 变了、蜂窝换 IP 等）；加「网络已连接」约束

装好后关掉 MacroDroid 的电池优化。其他选择：HTTP Shortcuts（开源，定时 POST + 桌面小部件）、Termux（见 [仓库 android/](https://github.com/kelenetwork/po0fw/tree/main/android)）。

### iOS

**有代理 App**（Surge / Loon / Stash / QX / 小火箭 / Egern）→ 打开**一键安装页** [po0fw.uuuz.de](https://po0fw.uuuz.de/)，点你客户端的「一键安装」按钮，装好后在模块参数里填 token 即可。带面板显示、蜂窝 📶 标记、切网即时触发 + 10 分钟 cron 兜底，功能最全。

> 一键按钮没反应？部分浏览器拦截 App URL Scheme，点「复制链接」后到客户端里「从 URL 安装/导入」。QX 需手动把片段加进 `[task_local]`，详见安装页说明。
> 模块部分借鉴学习自 [reallinzc/po0fw](https://github.com/reallinzc/po0fw)，感谢原作者。

**无代理 App** → 系统「快捷指令」：

1. 新建快捷指令 → 操作「获取 URL 内容」→ 填加白 URL → 方法 **POST**
2. 「自动化」→ 个人自动化 → 触发「Wi-Fi」任意网络 → 运行它，关「运行前询问」

⚠️ 快捷指令**没有后台定时**，只能靠 Wi-Fi 切换触发，抓不到「连着 Wi-Fi 但公网 IP 变了」的场景（好在这种情况家宽按 /24 加白通常同段，见 FAQ）。可再加「充电时」「打开某 App 时」等自动化多铺几个触发点；重度蜂窝用户请用代理客户端模块。

## 进阶：多机器与固定槽位

### 多台 po0 机器

每台机器 token 不同，用**英文逗号**拼起来，一次跑完全部：

```sh
# /etc/po0fw.conf
PO0FW_TOKENS="pgnfw_机器A,pgnfw_机器B,pgnfw_机器C"
```

### 固定槽位（@N）

默认坑满按 FIFO 淘汰最旧网段 —— 但**家宽出口**这种全家依赖的 IP，被挤掉哪怕几分钟都难受。在 token 后加 `@槽位号` 把它**钉死**，永不参与淘汰：

```sh
# 家宽路由钉 0 号槽位，其他机器普通模式
PO0FW_TOKENS="pgnfw_家宽路由@0,pgnfw_其他机器"
```

关键点：

1. 槽位号（0～4）是**你自己指定的**，不是面板里当前排第几
2. `@N` 要写进**配置文件**长期生效；临时敲一次命令，下个周期就回普通模式
3. 每个 IP 只占一个槽位；换槽位号前先去面板删旧槽位记录
4. 同段换 IP 自动跟随，不用重新钉
5. 流动设备（手机、外出笔记本）**别**钉槽位，浪费坑位，靠自愈就够

**推荐布局**：家宽 `@0` 钉死，剩 4 坑留给流动设备。

## FAQ

**Q：Wi-Fi 连着没断、但公网 IP 变了（家宽重拨），手机端能发现吗？**
「网络切换触发」确实抓不到这种静默变更，靠的是**定时兜底**：MacroDroid 15 分钟定时、iOS 代理模块 10 分钟 cron 都会照常上报。且家宽重拨大多在同一 /24 段内，本来就不需要重新加白。真正兜底主力应是**软路由**：它能感知 WAN 重拨事件，秒级加白 —— 这也是推荐装软路由的原因。

**Q：蜂窝数据换 IP 呢？**
同上，定时兜底捕捉，最迟一个周期（10~15 分钟）。蜂窝 IP 变化频繁且跨段，重度蜂窝用户建议用 iOS 代理客户端模块（有 cron）或安卓 MacroDroid（定时宏），别只靠快捷指令。

**Q：挂着代理会把代理节点 IP 加白吗？**
一般不会：请求直连官方 IP，按域名分流的代理碰不到。只有 TUN/透明代理全局接管才可能，加一条规则即可：

```text
IP-CIDR,124.221.69.228/32,DIRECT,no-resolve
```

软路由跑脚本时确认路由器自身流量不进代理链（OpenClash「绕过本机」等）。

**Q：白名单 5/5 满了？**
不用管，FIFO 自动淘汰最旧的；被挤出的设备最迟一个周期自动补回。

**Q：怎么卸载？**
- OpenWrt：`rm /usr/bin/po0fw /etc/po0fw.conf /etc/hotplug.d/iface/99-po0fw`，从 `/etc/crontabs/root` 删掉 po0fw 行
- Linux：`systemctl disable --now po0fw.timer; rm /etc/systemd/system/po0fw.{service,timer} /usr/local/bin/po0fw /etc/po0fw.conf`
- Windows：任务计划程序删「po0fw」，删 `%ProgramData%\po0fw`
- 安卓/iOS：删对应宏 / 快捷指令自动化
