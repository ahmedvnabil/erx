// ERX MCP client example — connect over Streamable HTTP, list tools, call egypt_search.
//
// Run from the repo root (the @modelcontextprotocol/sdk dependency is already installed):
//   node examples/mcp-client.mjs
//   ERX_MCP_URL=http://localhost:8080/mcp node examples/mcp-client.mjs
//
// No API key is required for public research.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.ERX_MCP_URL ?? "https://erx-mcp.zad.tools/mcp");

async function main() {
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: "erx-example-client", version: "1.0.0" });

  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    console.log(`connected to ${url.href}`);
    console.log(`${tools.length} tools available:`);
    for (const tool of tools) console.log(`  - ${tool.name}`);

    const result = await client.callTool({
      name: "egypt_search",
      arguments: { query: "قانون العمل", source_types: ["legal"], limit: 5 }
    });

    console.log("\negypt_search result:");
    for (const part of result.content ?? []) {
      if (part.type === "text") console.log(part.text);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
