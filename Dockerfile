# Root Dockerfile for Glama indexing of crewpay-mcp (stdio).
# Build context: repository root. For package-local builds see agent/crew-mcp/Dockerfile.
FROM node:22-bookworm-slim

WORKDIR /app

COPY agent/crew-mcp/package.json agent/crew-mcp/package-lock.json ./
RUN npm ci

COPY agent/crew-mcp/tsconfig.json ./
COPY agent/crew-mcp/src ./src
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production \
    CREW_API_URL=https://api.crewpay.dev \
    CREW_AGENT_API_KEY=glama_check_placeholder

CMD ["node", "dist/index.js"]
