# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Campus Resolve API — build stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /repo

# Install the whole workspace so the shared package is available.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig*.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Generate the Prisma client against the target platform.
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

RUN npm run build --workspace @campus-resolve/api

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /repo

ENV NODE_ENV=production

# Prisma needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev && npm cache clean --force

# The generated client and the query engines come from the build stage so the
# runtime image does not have to download them.
COPY --from=build /repo/node_modules/.prisma node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma node_modules/@prisma
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/apps/api apps/api

# The attachment directory is private and mounted as a volume.
RUN mkdir -p /var/lib/campus-resolve/attachments && chown -R node:node /var/lib/campus-resolve

USER node
WORKDIR /repo/apps/api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
