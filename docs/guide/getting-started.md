# 开始使用

本项目是 `wiki.kele.my` 的 Rspress 文档站，主要目录如下：

```text
wiki-kele/
├── docs/                 # 文档页面
├── src/components/       # React/TypeScript 组件
├── src/styles/           # 全局样式
├── public/               # 静态资源
├── nginx/                # 生产 Nginx 配置
├── Dockerfile            # 静态站点镜像
└── docker-compose.yml    # 本地生产运行入口
```

## 本地开发

```bash
npm install
npm run dev
```

开发服务器默认监听 `0.0.0.0`，Rspress 会输出可访问地址。

## 新增文档

1. 在 `docs/` 下新增 `.md` 或 `.mdx` 文件。
2. 如需侧边栏，在 `rspress.config.ts` 的 `themeConfig.sidebar` 中登记。
3. 页面标题使用一级标题，正文保持简洁、可扫描。

## 组件扩展

需要交互或可视化时，将组件放在 `src/components/`，再从 `.mdx` 页面中引入。
