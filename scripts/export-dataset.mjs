// export-dataset.mjs — build a reproducible ERX corpus snapshot for archival/citation.
//
// Usage:
//   node scripts/export-dataset.mjs [outputDir] [--database <path>] [--skip-build]
//
// Examples:
//   node scripts/export-dataset.mjs                       # -> dist-dataset/ from data/research.db
//   node scripts/export-dataset.mjs data/dataset          # custom output directory
//   node scripts/export-dataset.mjs data/dataset --database data/research.db
//   node scripts/export-dataset.mjs --skip-build          # reuse an existing dist/ build
//
// The script compiles the TypeScript sources (npm run build) unless --skip-build is
// passed, then invokes the compiled `dataset-dump` CLI command. The dump writes
// documents.jsonl, sources.json, and a versioned manifest.json (with per-file sha256
// checksums) into the output directory. See docs/reproducibility.md for how to cite
// and archive the resulting snapshot (e.g. minting a Zenodo DOI).

import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const skipBuild = argv.includes("--skip-build");
const rest = argv.filter((token) => token !== "--skip-build");

const databaseIndex = rest.indexOf("--database");
const database = databaseIndex >= 0 ? rest[databaseIndex + 1] : process.env.EGYPT_RESEARCH_DB;
const positional = rest.filter((token, index) => !token.startsWith("--") && index !== databaseIndex + 1);
const output = positional[0] ?? "dist-dataset";

const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!skipBuild) run("npm", ["run", "build"]);

const dumpArgs = ["dist/cli.js", "dataset-dump", "--output", output];
if (database) dumpArgs.push("--database", database);
run("node", dumpArgs);
