# syntax=docker/dockerfile:1
# Pypr API: NestJS + Prisma + headless Chromium for PDFs (decision D7).
# Build from the repository root:  docker build -f apps/api/Dockerfile -t pypr-api .

FROM node:24.21.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@pypr/api
# Production dependencies plus the built workspace packages, in one self-contained folder.
RUN pnpm deploy --legacy --filter=@pypr/api --prod /out \
 && cp -r apps/api/dist /out/dist

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /out ./
# Chromium headless shell, its system libraries and fonts (Liberation is metric-compatible
# with Helvetica/Arial used by the templates).
RUN npx --no-install playwright-core install --with-deps --only-shell chromium \
 && apt-get install -y --no-install-recommends fonts-liberation tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /app pypr \
 && chown -R pypr /app
USER pypr
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# tini as PID 1 forwards signals (graceful shutdown) and reaps Chromium's leftover processes.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
