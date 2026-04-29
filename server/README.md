# wiki-kele Probe Hub MVP

A standalone local Go + SQLite backend for probe snapshots. This batch only adds backend code under `server/`; it does not connect the frontend, Docker, nginx, or deployment files.

## Run

```bash
cd server
go test ./...
go build ./...
WIKI_ADMIN_TOKEN=dev-token go run .
```

Default bind address is `127.0.0.1:3331` and default database path is `./data/probe.db`.

## Environment

- `WIKI_PROBE_ADDR`: HTTP bind address, default `127.0.0.1:3331`.
- `WIKI_PROBE_DB`: SQLite file path, default `./data/probe.db`.
- `WIKI_ADMIN_TOKEN`: bearer token required for admin create/list endpoints.

## Public API

```bash
curl http://127.0.0.1:3331/healthz
curl http://127.0.0.1:3331/api/public/probes/snapshot
curl -N http://127.0.0.1:3331/api/public/probes/stream
```

`GET /healthz` returns:

```json
{"ok":true}
```

`GET /api/public/probes/snapshot` returns only public display fields for `sources`, `targets`, `checks`, and `series`. Example shape:

```json
{
  "sources": [{"id":"src-us-edge","display_name":"US Edge Probe","region":"us-west","tags":["edge","demo"],"status":"online","updated_at":"2026-01-01T00:00:00Z"}],
  "targets": [{"id":"tgt-docs","display_name":"Docs Portal","region":"global","tags":["web","demo"],"status":"online","updated_at":"2026-01-01T00:00:00Z"}],
  "checks": [{"id":"chk-us-docs","display_name":"US to Docs","source_id":"src-us-edge","target_id":"tgt-docs","tags":["https"],"status":"ok","latency_ms":41,"loss_pct":0,"jitter_ms":3,"updated_at":"2026-01-01T00:00:00Z"}],
  "series": [{"check_id":"chk-us-docs","points":[{"updated_at":"2026-01-01T00:00:00Z","latency_ms":41,"loss_pct":0,"jitter_ms":3}]}]
}
```

`GET /api/public/probes/stream` is an SSE endpoint that emits a `snapshot` event about every 3 seconds with the same filtered payload.

## Admin API

Admin endpoints require `Authorization: Bearer $WIKI_ADMIN_TOKEN`.

```bash
curl -H "Authorization: Bearer dev-token" http://127.0.0.1:3331/api/admin/sources
curl -H "Authorization: Bearer dev-token" http://127.0.0.1:3331/api/admin/targets
curl -H "Authorization: Bearer dev-token" http://127.0.0.1:3331/api/admin/checks

curl -X POST http://127.0.0.1:3331/api/admin/sources \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"id":"src-local","display_name":"Local Alias","region":"lab","tags":["demo"],"endpoint":"private.example.test:443"}'
```

The minimal admin implementation supports list and create for `sources`, `targets`, and `checks`.

## Privacy Guarantee

The SQLite schema stores private endpoint values for admin-created sources and targets, but public DTOs never select or serialize those columns. Public snapshot and SSE responses only include display-safe fields such as `id`, `display_name`, `region`, `tags`, `status`, `latency_ms`, `loss_pct`, `jitter_ms`, `updated_at`, and `series`.

Tests assert that public snapshots do not include private endpoint field names or seeded endpoint values.
