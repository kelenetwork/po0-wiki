# Probe / Looking Glass 实施清单

目标：把 `wiki.kele.my` 从静态 Rspress Wiki 逐步升级为「Wiki + Looking Glass + TCP Probe 监控」系统。

核心约束：
- 前台页面和 public API 不展示真实源 IP、目标 IP、端口。
- 真实 host/port 只允许存在于后端 DB、管理接口、agent 专属任务中。
- 大陆源机器不开放任何入站 Web/TLS 服务，只运行主动出站 agent。
- 不新增公网暴露端口；优先复用 `https://wiki.kele.my/api/...`。
- 每批由 Codex 修改，主助手验收后才 commit / 部署。

## 执行流程

每个批次必须执行：
1. Codex 只做本批范围内的文件修改。
2. 主助手检查 `git diff --name-status`，回滚越界改动。
3. 运行本批验证命令。
4. 检查 public 输出不泄露 `host/ip/address/port`。
5. commit 本批变更。
6. 进入下一批。

## 批次 A：Probe Hub 后端骨架

范围：只新增 `server/`。

要求：
- Go + SQLite。
- `GET /healthz`。
- `GET /api/public/probes/snapshot`，返回不含真实 IP/端口的快照。
- `GET /api/public/probes/stream`，SSE 推送不含真实 IP/端口的快照。
- 最小 admin list/create skeleton，使用 `Authorization: Bearer $WIKI_ADMIN_TOKEN`。
- 首次启动自动建表和 seed demo 数据。

禁止：
- 不改前端。
- 不改 Dockerfile / docker-compose / nginx。
- 不创建 agent。
- 不部署。

验收：
- `cd server && go test ./...`
- `cd server && go build ./...`
- 临时启动后 curl `/healthz` 返回 `{"ok":true}`。
- curl `/api/public/probes/snapshot` 不包含字段名 `host`、`ip`、`address`、`port`。

状态：已完成，待 commit。

## 批次 B：前端接入 public snapshot API

范围：只改 Rspress 前端页面/组件。

要求：
- `/status` 优先 fetch `/api/public/probes/snapshot`。
- API 不通时 fallback 到现有 mock 数据。
- `/looking-glass` 节点/目标选择数据来自 public snapshot 或同结构 mock。
- 前端类型定义只包含 public DTO，不包含真实 host/port。

禁止：
- 不改 Dockerfile / docker-compose / nginx。
- 不创建 agent。
- 不部署。

验收：
- `npm run build`
- 搜索前端源码和构建产物，确认无真实 IP/端口硬编码。

状态：已完成，已提交。

## 批次 C：Docker / nginx 接入后端

范围：容器编排与反代。

要求：
- docker-compose 增加 `probe-hub` 服务。
- nginx `/api/` 反代到 `probe-hub:3331`。
- 不新增公网端口，只通过现有 `wiki.kele.my` 访问。
- 设置必要 env：`WIKI_PROBE_DB`、`WIKI_ADMIN_TOKEN`。

验收：
- 部署前验证：`docker compose config`
- `docker compose build`
- 确认 `probe-hub` 未配置 `ports:`，只通过 compose 网络供 nginx 访问。
- 本地 compose 启动后：`curl http://127.0.0.1:3320/api/public/probes/snapshot`
- 线上部署后：`https://wiki.kele.my/api/public/probes/snapshot` 返回 200，且无敏感字段。

状态：已完成，未部署。

## 批次 D：Probe Agent

范围：新增 `agent/`。

要求：
- Go CLI。
- 不监听任何端口。
- 读取 JSON config。
- 主动 poll `/api/agent/poll`。
- 对分配目标做 TCP connect timing。
- report `/api/agent/report`。
- 提供 sample config 和 systemd unit。

验收：
- `cd agent && go test ./...`
- `cd agent && go build ./...`
- 本机模拟 agent 可上报 demo 结果到本地 hub。

状态：未开始。

## 批次 E：管理后台 / 接入命令

范围：管理 UI 或管理文档 + API。

要求：
- 添加/编辑源节点、目标、探测任务。
- 生成 agent 接入命令。
- 管理页可看到真实 host/port；public 页面不可看到。
- 管理接口 token 保护。

验收：
- 管理创建一组 source/target/check。
- Public snapshot 只显示别名和监控指标。
- Agent 接入命令可复制使用。

状态：未开始。

## 批次 F：Looking Glass 手动任务

范围：LG 任务下发与结果回传。

要求：
- 管理/公开受控入口创建一次性任务。
- agent poll 到任务后执行 tcping / ping / traceroute / mtr / nexttrace（逐步支持）。
- 结果以终端形式返回 UI。
- 限制目标白名单或权限，避免成为开放扫描器。

状态：未开始。
