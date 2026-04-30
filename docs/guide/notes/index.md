---
title: 注意事项
---

# 注意事项

这一组文章整理购买和使用前必须知道的边界：常见误解、端口和用途限制、延迟/丢包判断方式，以及反馈故障时应该提供的信息。

## 推荐阅读顺序

1. [常见问题 FAQ](/guide/faq)
2. [常见误区](/guide/notes/common-misunderstandings)
3. [怎么看延迟、丢包和路由波动](/guide/notes/latency-packet-loss-routing)
4. [使用前需要确认的限制](/guide/notes/pre-use-limitations)
5. [故障反馈应该提供哪些信息](/guide/notes/troubleshooting-feedback)

## 排障原则

先拆链路，再下结论：

```text
客户端 → Po0 → 出口机 → 目标服务
```

确认是哪一段出问题，比直接说“线路不行”更有用。
