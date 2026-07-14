import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TOOL_NAMES } from "../src/mcp.js";
import { MCP_TOOL_DOCS } from "../src/product.js";

describe("release metadata", () => {
  it("keeps npm and MCP Registry metadata aligned", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
    const serverJson = JSON.parse(readFileSync("server.json", "utf8")) as Record<string, unknown>;
    const repository = packageJson["repository"] as Record<string, unknown>;
    expect(packageJson["mcpName"]).toBe("io.github.ahmedvnabil/egypt-research");
    expect(repository["url"]).toBe("git+https://github.com/ahmedvnabil/erx.git");
    expect(serverJson["name"]).toBe(packageJson["mcpName"]);
    expect(serverJson["version"]).toBe(packageJson["version"]);
    expect(serverJson["websiteUrl"]).toBe("https://erx-mcp.zad.tools");
    expect(serverJson["repository"]).toEqual(expect.objectContaining({
      id: "1300883187",
      url: "https://github.com/ahmedvnabil/erx",
      source: "github"
    }));
    expect(serverJson["remotes"]).toEqual([
      { type: "streamable-http", url: "https://erx-mcp.zad.tools/mcp" }
    ]);
    expect(serverJson["packages"]).toEqual(expect.arrayContaining([
      expect.objectContaining({ registryType: "npm", identifier: packageJson["name"] })
    ]));
  });

  it("documents every public MCP tool exactly once", () => {
    expect(MCP_TOOL_DOCS.map(([name]) => name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("prepares both persistent volumes for the non-root runtime user", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("mkdir -p /data /backups");
    expect(dockerfile).toContain("chown -R app:app /data /backups");
  });
});
