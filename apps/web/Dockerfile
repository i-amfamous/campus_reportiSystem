# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Campus Resolve web client — build stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

COPY tsconfig*.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace @campus-resolve/web

# ---------------------------------------------------------------------------
# Runtime stage — static files served by nginx
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
