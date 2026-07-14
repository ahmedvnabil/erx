import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";
import { createWebServer } from "../src/web.js";
import { ResearchStore } from "../src/store.js";

describe("Streamable HTTP", () => {
  it("negotiates MCP and exposes the stable tool set", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-http-")), "research.db")); store.initialize();
    const http = createWebServer(store); await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address(); if (!address || typeof address === "string") throw new Error("missing address");
    const client = new Client({ name: "http-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)) as unknown as Transport);
    expect((await client.listTools()).tools).toHaveLength(14);
    await client.close(); await new Promise<void>((resolve) => http.close(() => resolve())); store.close();
  });
});
