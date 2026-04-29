# 部署说明

生产环境推荐使用静态构建产物，由 Nginx 提供服务。

## 构建

```bash
npm run build
```

Rspress 会输出静态文件到 `doc_build/`。

## Docker 运行

```bash
docker compose up -d --build
```

容器内 Nginx 监听 `80`，本机映射为 `3320`：

```text
http://127.0.0.1:3320
```

## Cloudflare Tunnel

本仓库不修改系统服务，也不内置 Tunnel 凭据。可在宿主机的 Cloudflare Tunnel 中将公开域名指向：

```text
http://127.0.0.1:3320
```

建议公开域名：`https://wiki.kele.my`。
