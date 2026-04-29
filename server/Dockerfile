FROM golang:1.23-alpine AS builder
WORKDIR /src
RUN apk add --no-cache ca-certificates
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/wiki-probe-hub .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /out/wiki-probe-hub /usr/local/bin/wiki-probe-hub
EXPOSE 3331
CMD ["wiki-probe-hub"]
