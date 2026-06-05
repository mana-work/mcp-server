#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ManaClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";

const MANA_API_URL = process.env.MANA_API_URL;
const MANA_API_KEY = process.env.MANA_API_KEY || process.env.MANA_TOKEN;

if (!MANA_API_URL) {
  console.error("Error: MANA_API_URL environment variable is required");
  console.error("Set it to your Manawork API URL (e.g., https://api.manawork.com)");
  process.exit(1);
}

if (!MANA_API_KEY) {
  console.error("Error: MANA_API_KEY environment variable is required");
  console.error("Generate an API key from Manawork > Settings > API Keys");
  process.exit(1);
}

const server = new McpServer({
  name: "manawork",
  version: "1.0.0",
});

const client = new ManaClient(MANA_API_URL, MANA_API_KEY);

registerAllTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
