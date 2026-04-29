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

范围：新增 `agent/`，并扩展 `server/internal/hub/` agent 接口。

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

状态：已完成，待验收。

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

状态：已由批次 E（新版）覆盖，待验收。

## 批次 F：Looking Glass 手动任务

范围：LG 任务下发与结果回传。

要求：
- 管理/公开受控入口创建一次性任务。
- agent poll 到任务后执行 tcping / ping / traceroute / mtr / nexttrace（逐步支持）。
- 结果以终端形式返回 UI。
- 限制目标白名单或权限，避免成为开放扫描器。

状态：未开始。

## 批次 C.1：Public DTO schema 对齐

背景：批次 C 部署后发现后端返回 `displayName / source / target / generatedAt` (camelCase, checks 内嵌 source/target 对象，无 series)；前端 `probeSnapshot.ts` 期望 `display_name / source_id / target_id / series` (snake_case)，导致 `isPublicProbeSnapshot` 校验失败、`/status` 实际 fallback 到 mock。

范围：只允许修改 `server/internal/hub/*.go`、`server/internal/hub/server_test.go`、`PROBE_IMPLEMENTATION_CHECKLIST.md`。

要求：
- public DTO 字段切换为 snake_case：`display_name`、`source_id`、`target_id`、`updated_at`、`latency_ms`、`loss_pct`、`jitter_ms`、`tags`（数组）。
- snapshot 顶层字段：`sources`、`targets`、`checks`、`series`。
- `checks[].source_id`、`checks[].target_id` 必须返回字符串类型 id（与 sources/targets 的 id 一致）。
- `series` 数组：每项 `{ check_id, points: [{ updated_at, latency_ms, loss_pct, jitter_ms }] }`，可基于 demo 数据生成或留空数组（但字段必须存在）。
- 仍然不得返回 `host`、`ip`、`address`、`port` 字段。
- demo 数据保留中文别名，不出现真实 IP/端口。
- `go test ./...`、`go build ./...` 通过。

禁止：
- 不改前端、Docker、nginx、agent。
- 不部署。

验收：
- `cd server && go test ./... && go build ./...`
- 临时启动 hub，curl `/api/public/probes/snapshot`：
  - 顶层包含 `sources`、`targets`、`checks`、`series`。
  - check 项含 `source_id`、`target_id`、`latency_ms`、`loss_pct`、`jitter_ms`、`updated_at`。
  - 不出现 `host`、`ip`、`address`、`port`。

状态：已完成，待验收。

## 批次 E（新版）：管理后台 + Agent 接入命令

范围：
- 新增 admin UI：登录页、源机器/目标/任务/Agent 四个管理页
- 扩展 hub admin 端点：targets/checks 创建编辑、agent token 重置、生成 agent 安装脚本
- 在 Rspress 中挂 `/admin` 路由

允许修改：
- `src/components/admin/*`、`src/pages/admin/*`、`src/styles/*`
- `docs/admin*.mdx`（如需）
- `rspress.config.ts`
- `server/internal/hub/*.go`、`server/main.go`
- `PROBE_IMPLEMENTATION_CHECKLIST.md`

禁止修改：
- `Dockerfile`、`docker-compose.yml`、`nginx/default.conf`、`server/Dockerfile`
- `agent/`
- 既有 `/status` 与 `/looking-glass`（不动现有公开页面行为）

要求：
1. 登录页 `/admin`：用户输入 admin token，存 localStorage；token 不写进 bundle。
2. 源机器管理 `/admin/sources`：列表 / 新增 / 编辑（display_name、region、tags），不需要 host/port。
3. 目标管理 `/admin/targets`：列表 / 新增 / 编辑（display_name、region、tags、真实 host、真实 port）；host/port 仅 admin 可见。
4. 任务管理 `/admin/checks`：列表 / 新增 / 编辑，选 source × target、interval_seconds、tags、enabled。
5. Agent 管理 `/admin/agents`：列表（仅展示 token 前缀、last_seen、hostname）、重置 token、复制接入命令。
6. Hub 增补必要端点：
   - `POST/PUT /api/admin/targets`、`POST/PUT /api/admin/checks`
   - `POST /api/admin/agents/{id}/reset-token` 重新生成明文 token（仅一次返回）
   - `GET /api/admin/agents/{id}/install` 返回 agent 安装片段（systemd 版），含一次性 token；调用一次后 token 失效或仅在 reset 后能再取
7. 安全：
   - admin 端点全部 `Authorization: Bearer $WIKI_ADMIN_TOKEN`
   - admin token 不写进前端 bundle，仅 localStorage
   - public snapshot 严禁返回 host/port
   - 安装脚本里 token 明文仅显示一次，刷新页面消失

验收：
- `npm run build` 通过
- `go test ./... && go build ./...`（server 目录）通过
- 临时本地起 hub：
  - 未带 admin token 访问 `/api/admin/*` 返回 401
  - 带 token 能创建 source/target/check
  - 创建 agent 能拿到一次性明文 token
  - 复位 token 后旧 token 失效
- public snapshot 仍无 `host/ip/address/port`

状态：已完成，待验收。

## 批次 E.1：admin UI 修复（汉化 + 编辑 + 删除）

背景：批次 E 上线后发现 admin UI 三个问题：
- 字段标签和表头是英文/蛇形，不汉化（如 `display_name`, `region`, `tags`, `最近 seen`, `token_prefix` 等）。
- 「编辑」点保存有时表现为新增；编辑时 ID 应该锁定不可改，明确 PUT 调用。
- 缺少删除按钮：sources/targets/checks/agents 都没有删除入口。

允许修改：
- `src/components/admin/AdminApp.tsx`、`src/components/admin/AdminApp.css`
- `src/pages/admin/*.tsx`（如需）
- `server/internal/hub/server.go`、`server/internal/hub/store.go`
- `PROBE_IMPLEMENTATION_CHECKLIST.md`

禁止修改：
- `Dockerfile`、`docker-compose.yml`、`nginx/default.conf`、`server/Dockerfile`
- `agent/`、`StatusProbe`/`LookingGlass` 既有组件、`probeSnapshot.ts`

要求：
1. 全部用户可见的中文：
   - 表单 label：`ID`、`显示名`、`区域`、`标签`、`真实 host（仅管理员可见）`、`真实端口`、`source 源机器`、`target 目标`、`轮询间隔（秒）`、`启用` 等。
   - 表头：`ID`、`显示名`、`区域`、`标签`、`状态`、`最近活动时间`、`最近上报`、`Token 前缀`、`主机名`、`版本`、`操作`。
   - 提示语：`已创建`、`已更新`、`已删除`、`确认删除？` 等。
2. 编辑流程修复：
   - 列表「编辑」按钮把当前行写入表单，并设置一个 `editingId` 状态。
   - 编辑模式下 ID 输入框 disabled，明确显示「编辑中：xxx」。
   - 表单上方新增「取消编辑」按钮，点了后清空 form 并退回新增模式。
   - 提交时根据 `editingId` 决定 PUT；新增时再 POST。不再用 `list.some(id===form.id)` 推断。
3. 删除：
   - 表格每行加「删除」按钮（红色），点击 confirm 后调用 DELETE。
   - 后端新增 `DELETE /api/admin/sources/{id}`、`DELETE /api/admin/targets/{id}`、`DELETE /api/admin/checks/{id}`、`DELETE /api/admin/agents/{id}`。
   - sources 删除前如有关联 checks，应 409 + 提示「请先删除关联任务」；targets 同理。
   - agents 删除即删除 token + 行，下次需要重新创建。
4. UI 微调：
   - 表头不要全大写（`text-transform: none`）。
   - 表格内空字段显示「—」。

验收：
- `npm run build` 通过。
- `cd server && go test ./... && go build ./...` 通过。
- 临时本地 hub 端到端：
  - 创建 → 编辑（PUT，状态码 200，记录更新而非新增）→ 删除（200/204，记录消失）。
  - sources 关联 check 时删除返回 409。
- public snapshot 仍无 host/ip/address/port。

状态：已完成。

## 批次 E.2：admin UI 整体重构

目标：把现有四屏分散的管理页改成「以源机器为主轴的一站式管理」，并把操作体验、错误处理、ID 生成都做对。

允许修改：
- `src/components/admin/*`、`src/pages/admin/*`、`src/styles/*`
- `server/internal/hub/*.go`、`server/internal/hub/server_test.go`、`server/main.go`
- `PROBE_IMPLEMENTATION_CHECKLIST.md`
- `rspress.config.ts`（仅 nav/sidebar/admin 路由必要时）

禁止修改：
- `Dockerfile`、`docker-compose.yml`、`nginx/default.conf`、`server/Dockerfile`
- `agent/`、`StatusProbe.tsx`、`LookingGlass.tsx`、`probeSnapshot.ts`

要求：

A. 源机器与 Agent 合并
- 取消独立的 `/admin/agents` 页（路由可保留 301 到 `/admin/sources`）。
- `/admin/sources` 既管源机器，也管它的 Agent。
- 列表每行展开后显示：Agent token 前缀、最近上报、主机名、版本、操作按钮。
- 操作按钮：编辑、删除、生成/重置 Token、查看接入命令、复制一行安装命令。
- 「新增源机器」→ 用户只填名称、地区、标签；后端自动 slugify 生成稳定 ID。
- 创建成功后弹出抽屉，里面就是 Agent 接入命令（systemd unit + config.json + 一行 install），明文 token 仅此一次显示。

B. 删除/编辑/创建一律 refetch
- 任意成功 mutation 后都立刻 GET 列表覆盖本地 state。
- 不再依赖局部 splice。

C. 抽屉式表单
- 列表上方一个「新增」按钮。
- 新增/编辑都打开右侧 / 底部抽屉表单，不再常驻表单。
- 关闭抽屉等于取消。
- 编辑模式下 ID 字段隐藏或灰色只读，标题为「编辑：xxx」。

D. ID 自动生成
- 后端新增 `slugify(name)` 生成 ID：拼音/英文小写、空白和特殊字符替换为 `-`、加前缀 `src-` / `tgt-` / `chk-`，冲突时追加 `-2`、`-3`。
- 前端表单不再显示 ID 字段；列表里以「次要展示」（淡色小字）显示 ID。
- 仍保留旧 demo 数据原 ID。

E. 「源 × 目标」交叉表
- `/admin/checks` 改造为交叉表：横轴 sources，纵轴 targets，单元格显示 check 状态/最近指标。
- 空单元格点击 → 抽屉表单创建新 check（自动绑定该 source/target，自动生成 ID）。
- 已存在的 check 单元格显示状态色块、最近 latency_ms，点击 → 抽屉里编辑/删除/查看历史。
- 上方仍保留传统表格 toggle，方便审视全量数据。

F. 错误与提示
- 全局 `useApi`/`adminFetch` 在非 2xx 时把后端 JSON `error` 字段抛出来。
- 顶部 toast 区域用 `notice`（成功）和 `errorBanner`（失败），失败 alert 不会自动消失，要用户点 X。
- 409 关联保护、422 校验、401/403 都按错误信息原样展示中文。

G. 顶部全局 Header
- 显示当前登录态（masked admin token 末四位）和「退出登录」按钮。
- 点退出登录清除 localStorage，跳回登录页。
- 「侧边栏」固定四项：源机器、目标、任务、退出。

H. 通用细节
- 表头不大写。
- 空字段显示 `—`。
- 时间字段统一格式化 `YYYY-MM-DD HH:mm:ss`（UTC+8 显示）。
- 标签输入框支持回车追加 chip + 点 X 删 chip（或直接逗号分隔，避免过度复杂）。
- 表格行 hover 高亮，操作按钮放右侧 sticky 列。

I. 后端补齐
- `POST /api/admin/sources` 接受 `{name, region, tags}` 并自动生成 ID；返回完整 source。
- 同理 `POST /api/admin/targets` 用 `{name,...}`、`POST /api/admin/checks` 自动生成 chk-ID。
- 关联保护错误 message 为 `error: "请先删除关联任务"`，前端原样展示。
- 仍可接受外部传入 `id`，向后兼容。

验收：
- `npm run build` 通过。
- `cd server && go test ./... && go build ./...` 通过。
- 本地端到端：
  - 加源机器只填名称即可，列表能立即看到。
  - 创建后弹出 Agent 接入命令，含 systemd unit、config.json、一行 install 命令；token 明文仅显示一次。
  - 编辑后 PUT，列表 refetch 看到更新；不会有重复行。
  - 删除返回 409 时 UI 显示「请先删除关联任务」红色 banner。
  - 任务交叉表可点空格创建任务、点已有任务格编辑/删除。
  - public snapshot 仍无 host/ip/address/port。

状态：已完成，待验收。

## 批次 E.3：admin UI 宽度修复 + 接入命令简化 + 目标协议字段（schema）

状态：已完成（2026-04-30）。验证：`npm run build`、`cd server && go test ./... && go build ./...`。

允许修改：
- `src/components/admin/*`、`src/pages/admin/*`、`src/styles/*`
- `server/internal/hub/*.go`、`server/internal/hub/server_test.go`、`server/main.go`
- `PROBE_IMPLEMENTATION_CHECKLIST.md`

禁止修改：
- `Dockerfile`、`docker-compose.yml`、`nginx/default.conf`、`server/Dockerfile`
- `agent/`（agent 协议扩展放到批次 D.1）
- `StatusProbe.tsx` / `LookingGlass.tsx` / `probeSnapshot.ts`

要求：

1. 全宽布局
- admin 页面不再受 Rspress doc-page 容器（max-width ~64rem）限制。
- admin 自己包一层 `.admin-shell`：宽度 100%，最大宽 1440px，居中。
- 表格列数多时横向滚动只发生在表格内部，不让整页 body 滚。
- 操作列 sticky 在表格右侧。
- 顶部 Header（Admin Token + 退出登录）右对齐，不和侧边栏重叠。

2. Token 始终可见 + 复制
- 取消「token 明文仅本次显示」的设计。
- 列表展开行展示完整 token（不是 token_prefix），右侧带「复制 Token」按钮。
- 「重置 Token」按钮：调用 reset-token 后立刻把新 token 写入展开行，无弹窗。
- 「查看安装命令」按钮：随时可点，弹抽屉显示 systemd unit + config.json + 一行 install 命令；token 用展开行那同一份；可一键复制 unit / config / install 命令。
- 「复制卸载命令」按钮：一键复制下面的卸载脚本（systemd unit + binary + config 全清）。
- agents 表行不再隐藏 token，显示 `wpa_xxxxxxxxxxxxxx`，可点眼睛切换显示/隐藏。

3. 后端调整
- `GET /api/admin/agents`：返回字段加 `token`（明文）；管理接口本来就是 admin 鉴权，可见明文。
- `GET /api/admin/agents/{id}/install` 接口取消「reset 后才能用」限制，admin token 可随时拿到 unit + config（其中 token 直接来自 DB）。
- `POST /api/admin/agents/{id}/reset-token` 仍生成新 token；返回包含明文。
- 服务端继续以哈希存储用于 agent 鉴权对比，但**额外保存明文** token 字段（因为业务上 admin 需要能看到）。如果要兼容旧库：建表迁移加 `token_plain` 列；旧行为 NULL 则视为「需要先 reset」（此时 UI 显示 token 列为「— 重置以生成 Token」）。
- 后端继续校验：DELETE 关联保护、PUT/POST、admin 鉴权。

4. 目标协议字段（schema 层）
- Targets 新增字段 `kind`：枚举 `tcp` / `icmp` / `http`，默认 `tcp`，向后兼容（旧 demo 数据全部默认 `tcp`）。
- `http` kind 额外字段 `path`（默认 `/`）。
- 数据库迁移：targets 表加 `kind TEXT NOT NULL DEFAULT 'tcp'`、`path TEXT NOT NULL DEFAULT ''`。
- public snapshot DTO：暴露 `kind`，不暴露 `host` / `port` / `path`。
- admin DTO：暴露 `host` / `port` / `path` / `kind`。
- 前端表单 Target 抽屉加协议下拉：tcp/icmp/http；选择 icmp 时隐藏 port 输入；选择 http 时显示 path 输入。
- targets 列表「地址」列按 kind 渲染：
  - tcp：`host:port`
  - icmp：`icmp host`
  - http：`http(s)://host:port/path`（默认 https；若 port=80 用 http://，否则 https://）
- agent 端**本批不实现** icmp / http，只准备 schema；agent poll 接口仍只返回 tcp host/port，icmp/http 类型先跳过或返回 type/host 信息但 agent 暂时只跑 tcp。批次 D.1 再补 agent 协议。

5. Toast/错误
- 复制 token / 复制 unit / 复制 install / 复制 uninstall 都给「已复制到剪贴板」 toast。

验收：
- `npm run build` 通过。
- `cd server && go test ./... && go build ./...` 通过。
- 本地端到端：
  - 创建 source → 列表展开行直接看到明文 token + 复制按钮。
  - 点重置 Token → 行内 token 替换为新值。
  - 点查看安装命令 → 抽屉显示 unit + config + install + uninstall，复制按钮工作。
  - 创建 target 时切换 kind=icmp，表单隐藏 port；保存后列表「地址」列展示「icmp host」。
  - public snapshot 仍无 host/ip/address/port/path 字段。

## 批次 D.1：Agent 多协议（icmp + http）

状态：已实现（agent tcp/icmp/http 分流、hub agent poll 私有字段、agent/server 测试与文档已更新）。

允许修改：
- `agent/*`（全部）
- `server/internal/hub/server.go`、`server/internal/hub/store.go`、`server/main.go`、`server/internal/hub/server_test.go`：扩展 agent poll 响应携带 kind/path 等信息
- `PROBE_IMPLEMENTATION_CHECKLIST.md`

禁止修改：
- `Dockerfile`、`docker-compose.yml`、`nginx/default.conf`、`server/Dockerfile`
- `src/`、`docs/`

要求：
1. Hub agent poll 响应：每个 check 增加字段 `kind` / `host` / `port` / `path`（仅对认证 agent 可见，public snapshot 保持隐私）。
2. Agent CLI：
   - 收到 check 时根据 `kind` 分流：
     - `tcp`：现有 TCP connect 逻辑保留。
     - `icmp`：使用 unprivileged ICMP（`golang.org/x/net/icmp` 配合 `net.ListenPacket("udp4","")`）；实现 3 次探测、记录 RTT/丢包/抖动；如不可用则记录 status=fail + error="icmp unsupported"。
     - `http`：使用 net/http GET `scheme://host:port{path}`（port=80 → http；其他 → https），带 timeout=tcp_timeout_ms；记 latency_ms = 请求耗时；非 2xx 视为 fail；不跟随重定向到外站。
   - 上报字段保持现状：tcp_connect_ms（兼容老字段名）+ status/loss/jitter/error/observed_at。
3. README 更新：
   - icmp 需要 `sysctl -w net.ipv4.ping_group_range="0 2147483647"` 或 systemd `AmbientCapabilities=CAP_NET_RAW`，写明两种方案。
   - http 模式遵循出站 only 原则。
   - 卸载脚本（与 admin UI 一致）。
4. systemd unit 文件：增加注释说明 icmp 需要的能力配置（默认仍用 DynamicUser，不自动给 CAP_NET_RAW；用户按需开启）。
5. 测试：
   - probe_test.go 增加 http 路径：用 `httptest` 启 server，验证 latency 测量与 status。
   - icmp 单元测试可跳过（CI 没 raw socket），保留 stub function 测试。
6. 不部署，不改 Docker/nginx；agent 二进制保留 `.gitignore`。

验收：
- `cd agent && go test ./...`
- `cd agent && go build ./...`
- `cd server && go test ./... && go build ./...`
- 本地端对端：
  - hub 中创建 target kind=tcp/http 各一，agent poll 后能在 report 中看到对应 latency_ms。
  - icmp 用本机 ping 127.0.0.1 验证（如系统支持 unprivileged icmp）。
