# Stage 1: build the whatsmeow connector sidecar (pure Go, static binary)
FROM golang:1.26-alpine AS connector
WORKDIR /src
COPY connector/go.mod connector/go.sum ./connector/
RUN cd connector && go mod download
COPY connector/ ./connector/
RUN cd connector && CGO_ENABLED=0 go build -o /wabro-connector .

# Stage 2: runtime
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY . .

# Connector binary (spawned as a child process by backend/connector.js)
COPY --from=connector /wabro-connector ./connector/wabro-connector

EXPOSE 3002

ENV PORT=3002

CMD ["node", "server.js"]
