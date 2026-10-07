# The runtime smoke test needs Chromium and its system libraries. This image
# already contains them (Playwright's official base, pinned to the same minor
# version as the "playwright" dependency in package.json).
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production \
    AI_RUNTIME_CHECK=required
EXPOSE 3001
CMD ["node", "server.js"]
