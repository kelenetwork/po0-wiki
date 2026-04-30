---
title: 指南首页
---

# Po0 使用指南

这份指南给准备购买、已经购买、正在配置或需要排障的用户阅读。你不需要按页面顺序全部看完，按自己的阶段进入即可。

## 我还没购买

先看选购指南，确认 Po0 是否适合你的用途，再用状态页和 Looking Glass 看当前线路表现。

- [Po0 适合谁](/guide/buying/who-is-po0-for)
- [入口地区怎么选](/guide/buying/choose-entry-region)
- [出口与落地怎么选](/guide/buying/choose-exit-location)
- [成本、流量与稳定性](/guide/buying/cost-vs-stability)
- [用状态页与 Looking Glass 判断效果](/guide/buying/status-and-looking-glass)
- [使用前需要确认的限制](/guide/notes/pre-use-limitations)

## 我已经购买，准备配置

先把基础链路跑通，再按需要安装监控或接入面板。

- [从购买到连通](/guide/tutorials/quick-start)
- [接入前准备清单](/guide/tutorials/before-onboarding)
- [购买后的基础配置](/guide/tutorials/post-purchase-setup)
- [系统重装 Debian 12](/guide/tutorials/reinstall-debian)
- [nftables 转发脚本配置](/guide/tutorials/nftables-script)
- [nftables 手动转发配置](/guide/tutorials/nftables-port-forwarding)

## 我需要监控或面板

这些教程不是每个人都必须做。需要监控在线状态、流量或接入面板时再看。

- [安装哪吒监控](/guide/tutorials/nezha-monitoring)
- [挂载 Nyanpass 面板](/guide/tutorials/nyanpass-panel)

## 我遇到问题

先拆链路，再反馈。不要只说“慢”或“连不上”，尽量提供入口、出口、时间和测试结果。

- [常见问题 FAQ](/guide/faq)
- [常见误区](/guide/notes/common-misunderstandings)
- [怎么看延迟、丢包和路由波动](/guide/notes/latency-packet-loss-routing)
- [故障反馈应该提供哪些信息](/guide/notes/troubleshooting-feedback)

## Po0 的核心理解

Po0 更像一台高质量的“入口机”：用户先接入腾讯云 BGP 入口，再通过内网互通链路去连接香港、日本等出口或落地资源。它的价值不是单纯堆硬件参数，而是把入口质量、内网互通、落地选择和长期稳定性组合起来。

简单理解：

```text
用户设备 → Po0 入口 → 内网互通链路 → 香港/日本/其他出口或落地
```

官网当前可见的产品大致分两类：

- **腾讯云 T1 香港 / 美国**：国际优化链路，官网明确提示“不包含国内优化”。
- **腾讯云广州 BGP / 华东 BGP**：国内 BGP 入口，大带宽、低延迟内网，适合作为跨境链路入口；需实名，并有用途和端口限制。

## 不确定就先问

如果你不确定该买广州、华东、香港还是美国，先准备这三个信息：

1. 你的主要使用地区在哪里；
2. 你想去的出口或落地在哪里；
3. 你大概需要多少带宽和月流量。

带着这三个信息去看选购指南，会比只看“哪个最低延迟”更准确。
