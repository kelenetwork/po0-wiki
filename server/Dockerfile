FROM golang:1.23-alpine AS builder
WORKDIR /src
RUN apk add --no-cache ca-certificates
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/wiki-probe-hub .

FROM alpine:3.21
ARG TARGETARCH
RUN apk add --no-cache ca-certificates curl mtr iputils traceroute \
  && case "${TARGETARCH:-amd64}" in \
    amd64|arm64) NEXTTRACE_ARCH="${TARGETARCH:-amd64}" ;; \
    *) echo "unsupported nexttrace arch: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && curl -fsSL "https://github.com/sjlleo/nexttrace/releases/latest/download/nexttrace_linux_${NEXTTRACE_ARCH}" -o /usr/local/bin/nexttrace \
  && chmod +x /usr/local/bin/nexttrace
WORKDIR /app
COPY --from=builder /out/wiki-probe-hub /usr/local/bin/wiki-probe-hub
EXPOSE 3331
CMD ["wiki-probe-hub"]
