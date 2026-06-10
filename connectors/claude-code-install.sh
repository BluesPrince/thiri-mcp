#!/bin/bash
# Install the THIRI Chord Intelligence MCP server into Claude Code

if [ -z "$THIRI_API_KEY" ]; then
  echo "Error: THIRI_API_KEY environment variable is not set."
  echo "Please set it before running this script: export THIRI_API_KEY=sk_live_..."
  exit 1
fi

echo "Adding THIRI MCP server to Claude Code..."
claude mcp add thiri --env THIRI_API_KEY="$THIRI_API_KEY" -- npx -y @bluesprincemedia/thiri-mcp
echo "Install complete!"
