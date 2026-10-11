# Package-local Dockerfile for crewpay-mcp (stdio). Build context: agent/crew-mcp.
# Starts and lists tools with NO env set; previews (crew_autohire, crew_discover, crew_proof)
# work keyless. Writes need CREW_AGENT_API_KEY. Glama uses the repo-root Dockerfile.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: "prepare" runs the build, which needs src (copied below).
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts && rm -rf src tsconfig.json

ENV NODE_ENV=production \
    CREW_API_URL=https://api.crewpay.dev

USER node
CMD ["node", "dist/index.js"]
