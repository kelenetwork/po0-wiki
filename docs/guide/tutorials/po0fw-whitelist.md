# 防火墙白名单自动加白（po0fw）

Po0 的「鸡险」增值服务附带防火墙白名单功能：开启后**只有白名单里的来源 /24 网段才能访问入站端口**，用来保障用户机器权益。家宽 IP 经常变，手动加白很快就会烦。本教程教你用 `po0fw` 脚本让设备**自动**把自己的出口 IP 加进白名单，支持：

- **PC**：Linux / macOS / Windows
- **安卓**：Termux
- **软路由**：OpenWrt / Kwrt（推荐 —— 路由器加白一次，全家设备受益）
- **iOS 代理客户端**（Surge / Loon / Stash / QX / Shadowrocket / Egern）：直接用群友的 [po0fw iOS 版](https://po0fw.rlyio.com/)，本文脚本是它的 PC/路由器移植版

脚本开源：[github.com/kelenetwork/po0fw](https://github.com/kelenetwork/po0fw)

## 工作原理（30 秒看懂）

1. 每 10 分钟（以及网络切换时）探测本机 IPv4 出口
2. 先查白名单状态：出口所在 **/24 网段**已在白名单 → 什么都不做
3. 不在 → 调 po0 官方 API 加白
4. 白名单上限 5 个，写满按最早写入自动淘汰；被挤掉的设备下个周期自动补回（自愈）

同网段换 IP（家宽拨号重连常见）不消耗新坑位，所以日常几乎无感。

## 第一步：获取 token

1. 打开 po0 控制台 → 进入你的机器详情页
2. 找到「防火墙」卡片，点 **复制添加脚本**（不是「添加当前 IP」）
3. 复制到的内容里有一串 `pgnfw_` 开头的字符 —— 那就是这台机器的 token

::: warning token 就是加白凭证
拿到 token 就能改你机器的白名单。不要发群里、不要截图给别人。每台机器 token 不同。
:::

## 第二步：安装

### 软路由 OpenWrt / Kwrt（推荐）

SSH 登录路由器，执行：

```sh
curl -sSL https://raw.githubusercontent.com/kelenetwork/po0fw/main/openwrt/install-openwrt.sh -o /tmp/i.sh
PO0FW_TOKENS="pgnfw_你的token" sh /tmp/i.sh
```

安装内容：

- 主脚本 `/usr/bin/po0fw`，配置 `/etc/po0fw.conf`
- cron 每 10 分钟兜底检查
- WAN 口拨号/重连（hotplug）时**秒级**触发加白 —— PPPoE 换 IP 基本无感

验证：

```sh
po0fw            # 手动跑一次
cat /tmp/po0fw.log   # 看最近一次 cron 结果
```

### Linux / macOS

```sh
curl -sSL https://raw.githubusercontent.com/kelenetwork/po0fw/main/install-linux.sh | PO0FW_TOKENS="pgnfw_你的token" sh
```

- Linux（root）：自动注册 systemd timer，`systemctl status po0fw.timer` 可查
- macOS / 非 root：自动写入 crontab

### Windows

管理员 PowerShell：

```powershell
irm https://raw.githubusercontent.com/kelenetwork/po0fw/main/windows/install-windows.ps1 -OutFile i.ps1
powershell -ExecutionPolicy Bypass -File i.ps1 -Tokens "pgnfw_你的token"
```

注册计划任务「po0fw」：每 10 分钟 + 网络连接事件双触发。任务计划程序里可以看到运行记录。

### 安卓（Termux）

装 [Termux](https://termux.dev/)，然后：

```sh
pkg install -y curl
curl -sSL https://raw.githubusercontent.com/kelenetwork/po0fw/main/install-linux.sh | PO0FW_TOKENS="pgnfw_你的token" sh
sv-enable crond   # 启用定时任务
```

注意 Termux 被杀后台后定时会停；建议在系统设置里给 Termux 加电池白名单。**如果你家里有软路由，优先在软路由装** —— 手机连家里 Wi-Fi 时天然被覆盖。

## 常用命令

```sh
po0fw                        # 检查并按需加白
po0fw status                 # 只看当前白名单，不做修改
po0fw pgnfw_aaa,pgnfw_bbb    # 多台机器：token 逗号分割
po0fw pgnfw_aaa@0            # 固定 0 号槽位（常驻不被淘汰）
```

## 进阶：多机器与固定槽位

- **多台 po0 机器**：把每台的 token 用英文逗号拼在一起填进配置，一次跑完全部
- **固定槽位** `@N`：让某个网段（比如家宽出口）钉死在槽位上不参与 FIFO 淘汰。注意每个 IP 只能占一个槽位，换槽前先在面板删掉旧槽位

修改 token：编辑 `/etc/po0fw.conf`（Windows 为 `%ProgramData%\po0fw\po0fw.conf`）后等下个周期生效即可。

## FAQ

**Q：我挂着代理，会把代理服务器 IP 加白吗？**
会！这是最常见的坑。脚本本身不走系统代理，但如果你的代理软件（Clash TUN / 软路由透明代理等）接管了全部流量，探测到的出口和加白请求都会走代理节点，把**节点的 IP** 加进白名单。**务必把以下域名加入直连（DIRECT）分流规则**：

```text
DOMAIN,console.po0.io,DIRECT
DOMAIN,api-ipv4.ip.sb,DIRECT
DOMAIN,ipv4.icanhazip.com,DIRECT
DOMAIN,api.ipify.org,DIRECT
```

软路由透明代理场景：脚本跑在路由器本机上时，请确认路由器自身发出的流量不进代理链（OpenClash「绕过本机」/ Passwall 本机代理关闭），或按上面域名加直连规则。

**Q：家宽换 IP 后多久生效？**
软路由版：WAN 重连秒级触发；其他平台最迟 10 分钟。且 po0 按 /24 加白，同段换 IP 根本不需要重新加白。

**Q：白名单 5/5 满了怎么办？**
不用管。服务端按写入时间自动淘汰最旧的；被挤出的设备自己的定时任务会在 10 分钟内补回。

**Q：怎么卸载？**
- OpenWrt：`rm /usr/bin/po0fw /etc/po0fw.conf /etc/hotplug.d/iface/99-po0fw`，再从 `/etc/crontabs/root` 删掉 po0fw 那行
- Linux：`systemctl disable --now po0fw.timer; rm /etc/systemd/system/po0fw.{service,timer} /usr/local/bin/po0fw /etc/po0fw.conf`
- Windows：任务计划程序删除「po0fw」任务，删 `%ProgramData%\po0fw`
