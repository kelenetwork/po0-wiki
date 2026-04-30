---
title: 使用教程
---

# 使用教程

这里放具体操作教程。建议先跑通最小链路，再按需要做系统重装、监控、面板和更复杂的转发。

## 推荐阅读顺序

1. [从购买到连通](/guide/tutorials/quick-start)
2. [接入前准备清单](/guide/tutorials/before-onboarding)
3. [购买后的基础配置](/guide/tutorials/post-purchase-setup)
4. [nftables 转发脚本配置](/guide/tutorials/nftables-script)

## 按需求选择

| 你要做什么 | 看哪篇 |
| --- | --- |
| 想快速知道完整流程 | [从购买到连通](/guide/tutorials/quick-start) |
| 第一次配置，怕漏信息 | [接入前准备清单](/guide/tutorials/before-onboarding) |
| 刚拿到机器，先做基础设置 | [购买后的基础配置](/guide/tutorials/post-purchase-setup) |
| 想重装干净 Debian 12 | [系统重装 Debian 12](/guide/tutorials/reinstall-debian) |
| 想用菜单增删转发规则 | [nftables 转发脚本配置](/guide/tutorials/nftables-script) |
| 想自己维护 nftables 规则 | [nftables 手动转发配置](/guide/tutorials/nftables-port-forwarding) |
| 想看在线状态和资源占用 | [安装哪吒监控](/guide/tutorials/nezha-monitoring) |
| 想挂载到 NY 面板 | [挂载 Nyanpass 面板](/guide/tutorials/nyanpass-panel) |

## 接入原则

第一次使用时，先把最简单的链路跑通：

```text
客户端 → Po0 → 出口机
```

确认稳定后，再考虑多层中转或自备落地。一次只改一个环节，排查会轻松很多。
