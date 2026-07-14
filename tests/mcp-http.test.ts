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
    expect((await client.listTools()).tools).toHaveLength(15);
    await client.close(); await new Promise<void>((resolve) => http.close(() => resolve())); store.close();
  });

  it("rejects cross-origin requests and malformed JSON with protocol errors", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-http-security-")), "research.db")); store.initialize();
    const http = createWebServer(store); await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address(); if (!address || typeof address === "string") throw new Error("missing address");
    const endpoint = `http://127.0.0.1:${address.port}/mcp`;
    const crossOrigin = await fetch(endpoint, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(crossOrigin.status).toBe(403);
    const malformed = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: -32700 }) }));
    await new Promise<void>((resolve) => http.close(() => resolve())); store.close();
  });

  it("keeps the public remote transport read-only", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-http-readonly-")), "research.db")); store.initialize();
    const http = createWebServer(store); await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address(); if (!address || typeof address === "string") throw new Error("missing address");
    const client = new Client({ name: "http-readonly-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)) as unknown as Transport);
    const result = await client.callTool({ name: "save_research_query", arguments: { name: "shared write", query: "economy" } });
    expect(result.isError).toBe(true);
    expect(store.listSavedSearches()).toHaveLength(0);
    await client.close(); await new Promise<void>((resolve) => http.close(() => resolve())); store.close();
  });
});
