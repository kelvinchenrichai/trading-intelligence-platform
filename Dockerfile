# Render build reliability hotfix v1.0.3
# Avoids a single stalled npm download holding the build for ~10 minutes.
# Uses a BuildKit npm cache and installs dependencies only in the build stage.

FROM node:22-alpine AS build
WORKDIR /app

# Use the public registry directly, retry briefly, then fail with a useful log
# instead of remaining silent for an extended period.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=2 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=2000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=15000 \
    NPM_CONFIG_FETCH_TIMEOUT=120000 \
    NPM_CONFIG_PREFER_OFFLINE=true \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package*.json ./
# Cache downloaded npm tarballs across compatible BuildKit builds.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline

COPY . .

# --- 前端 (Vite) build-time 變數 ---
# VITE_ 變數必須在「執行 vite build 時」就存在於環境,才會被打包進前端靜態檔。
# Render 的環境變數預設只給 runtime,因此這裡用 ARG 接收、轉成 ENV 供 build 使用。
# 這些是可公開的前端變數 (publishable key / 網址),不含任何後端 secret。
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_EMAILS
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS

RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache poppler-utils
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
