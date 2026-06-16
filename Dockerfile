# Lets Glama (and other registries) boot the THIRI MCP server in a container
# and run introspection (initialize / tools/list). THIRI speaks MCP over stdio.
FROM node:20-slim
WORKDIR /app

# Deps (no lockfile committed → npm install, which also pulls devDeps for the build)
COPY package.json ./
RUN npm install

# Compile TypeScript → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Introspectable stdio entrypoint (same as the `thiri-mcp` bin / npx target).
CMD ["node", "dist/index.js"]
