import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const serverJson = JSON.parse(readFileSync("server.json", "utf8"));
const sourceVersion = /VERSION = "([^"]+)"/.exec(readFileSync("src/version.ts", "utf8"))?.[1];
const citationVersion = /^version:\s*(\S+)$/m.exec(readFileSync("CITATION.cff", "utf8"))?.[1];
const tag = process.env.GITHUB_REF_NAME?.replace(/^v/, "");
const versions = [packageJson.version, serverJson.version, serverJson.packages?.[0]?.version, sourceVersion, citationVersion];

if (new Set(versions).size !== 1) throw new Error(`Release versions differ: ${versions.join(", ")}`);
if (serverJson.name !== packageJson.mcpName) throw new Error("server.json name must match package.json mcpName");
if (tag && tag !== packageJson.version) throw new Error(`Tag ${tag} does not match package version ${packageJson.version}`);
process.stdout.write(`Release metadata valid for v${packageJson.version}\n`);
