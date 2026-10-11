# Root Dockerfile for Glama (and any MCP host) to build and run crewpay-mcp over stdio.
# Build context: repository root. Starts and lists tools with NO env set; previews
# (crew_autohire, crew_discover, crew_proof) work keyless. Writes need CREW_AGENT_API_KEY.
FROM node:22-bookworm-slim

WORKDIR /app

COPY agent/crew-mcp/package.json agent/crew-mcp/package-lock.json ./
# --ignore-scripts: "prepare" runs the build, which needs src (copied below).
RUN npm ci --ignore-scripts

COPY agent/crew-mcp/tsconfig.json ./
COPY agent/crew-mcp/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts && rm -rf src tsconfig.json

ENV NODE_ENV=production \
    CREW_API_URL=https://api.crewpay.dev

USER node
CMD ["node", "dist/index.js"]
