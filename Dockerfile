
FROM golang:1.27.2-alpine AS builder
WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

COPY . .
RUN go build -o server .

FROM alpine:3.22

WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/templates ./templates

EXPOSE 3000

CMD ["./server"]
