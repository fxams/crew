# Glama / local container build for crewpay-mcp (stdio).
# Introspection only needs the process to start; set dummy env for CI checks.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production \
    CREW_API_URL=https://api.crewpay.dev \
    CREW_AGENT_API_KEY=glama_check_placeholder

CMD ["node", "dist/index.js"]
