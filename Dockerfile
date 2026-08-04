# 构建 Vite 前端产物。
FROM oven/bun:1.3.14 AS web-build

ARG VITE_BASE=/creative/
ENV VITE_BASE=${VITE_BASE}

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --cache-dir=/root/.bun/install/cache
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN bun run build

# 运行镜像：只启动静态前端，业务请求统一交给同域 FYJIT Creative BFF。
FROM nginx:1.27-alpine

ARG SOURCE_COMMIT=unknown
ARG SOURCE_URL=
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV SOURCE_URL=${SOURCE_URL}
LABEL org.opencontainers.image.source=${SOURCE_URL} \
      org.opencontainers.image.revision=${SOURCE_COMMIT} \
      org.opencontainers.image.licenses="AGPL-3.0-only"

COPY --from=web-build /app/web/dist /usr/share/nginx/html/creative
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
