# THIRI Chord Intelligence — Agent & Client Integration Guide

This directory contains pre-configured templates and instructions to connect the **THIRI Chord Intelligence MCP Server** to popular AI assistants, platforms, and registries.

---

## 🤖 Claude Integration

### 1. Claude Desktop (Local)
To add THIRI Chord Intelligence to your local Claude Desktop app, copy the template in [claude-desktop-config.json](./claude-desktop-config.json) to your configuration file:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "thiri": {
      "command": "npx",
      "args": ["-y", "@bluesprincemedia/thiri-mcp"],
      "env": {
        "THIRI_API_KEY": "YOUR_SK_LIVE_KEY"
      }
    }
  }
}
```

### 2. Claude Code (CLI)
You can run the install script in [claude-code-install.sh](./claude-code-install.sh) or execute this command directly in your shell:
```bash
claude mcp add thiri --env THIRI_API_KEY=YOUR_SK_LIVE_KEY -- npx -y @bluesprincemedia/thiri-mcp
```

### 3. Claude.ai (Custom Connectors / Enterprise)
If you have access to custom web connectors on Claude.ai:
1. Go to **Settings** → **Connectors** → **Add Custom Connector**.
2. Set the base schema URL to `https://mcp.thiri.ai/mcp`.
3. Provide your developer `sk_live_` API key on the secure consent gate.
4. Configure the connector with the instructions provided in [SYSTEM_PROMPT.md](./SYSTEM_PROMPT.md).
5. (Optional) Upload [logo.png](./logo.png) as the custom connector icon.

---

## 💬 ChatGPT Integration (Custom GPT Actions)

To use THIRI's music theory capabilities inside ChatGPT, you can build a custom **GPT** and wire it via an **Action**:

1. Go to **Explore GPTs** → **Create**.
2. Upload the brand icon [logo.png](./logo.png) as the profile picture for the GPT.
3. Copy the instructions from [SYSTEM_PROMPT.md](./SYSTEM_PROMPT.md) and paste them into the **Instructions** block.
4. Click **Create new action** in the configuration tab.
5. Under **Schema**, paste the contents of [chatgpt-action-openapi.json](./chatgpt-action-openapi.json) (or the YAML version from [openapi.yaml](../openapi.yaml)).
6. Under **Authentication**, select **API Key**, set authentication type to **Bearer**, and paste your THIRI developer key (`sk_live_...`).
7. Save and publish your GPT.

---

## 🚀 MCP registries & Server Distributors

To maximize visibility and enable easy one-click installs for other developers, this server is registered/submittable to:

### 1. Smithery (smithery.ai)
Smithery allows automated installation of MCP servers.
- **Install command:** `npx @smithery/cli install @bluesprincemedia/thiri-mcp --write-to claude`
- **Registry page:** Submitted under `@bluesprincemedia/thiri-mcp`.

### 2. Glama Registry (glama.ai/mcp)
Glama is an open registry for MCP servers.
- Add by linking this repository: `https://github.com/bluesprince/thiri-mcp`
- Tool manifests are auto-discovered from `package.json`'s bin commands.

### 3. Pulse / Awesome MCP list
- Submit a Pull Request to the official Awesome MCP repositories (e.g., `modelcontextprotocol/awesome-mcp`) listing THIRI under **Music / Creative** categories.
