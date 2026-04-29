# 可乐 Wiki

`wiki.kele.my` 的 Rspress 中文文档 / Wiki 项目，包含基础文档结构、服务状态占位组件，以及 Docker + Nginx 静态部署配置。

## 技术栈

- Rspress / React / Rsbuild
- TypeScript
- Nginx 静态生产服务
- Docker Compose 本地生产运行，默认端口 `3320`

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `doc_build/`。

## 本地预览

```bash
npm run preview
```

访问：`http://127.0.0.1:3320`

## Docker 生产运行

```bash
docker compose up -d --build
```

访问：`http://127.0.0.1:3320`

停止服务：

```bash
docker compose down
```

## Cloudflare Tunnel 暴露建议

本项目不写入系统服务，也不保存 Cloudflare 凭据。请在宿主机已有的 Cloudflare Tunnel 中添加公开主机名：

```text
wiki.kele.my -> http://127.0.0.1:3320
```

## 目录说明

```text
docs/                 文档页面
src/components/       React/TypeScript 组件
src/styles/           全局样式
public/               Logo、favicon 等静态资源
nginx/default.conf    Nginx 静态站点配置
Dockerfile            多阶段构建镜像
docker-compose.yml    本地生产运行配置
```

## 状态页二次开发

`src/components/StatusProbe.tsx` 目前使用静态模拟数据。后续可替换为真实接口数据，用于展示 TCPing、HTTP 探测、延迟、丢包率、最近更新时间和告警状态。
