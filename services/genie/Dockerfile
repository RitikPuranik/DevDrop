FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* bun.lock* ./
COPY vendor ./vendor
RUN npm install --omit=dev --legacy-peer-deps

COPY . .

ENV NODE_ENV=production
EXPOSE 3001

# Genie runs on tsx directly (see package.json "start" script) — no build
# step required. Health check matches Genie's existing GET /api/status.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/api/status', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "start"]
