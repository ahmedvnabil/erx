import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBackup, restoreBackup, verifyBackup } from "../src/backup.js";
import { ResearchStore } from "../src/store.js";

describe("SQLite backup lifecycle", () => {
  it("creates, verifies, and restores with a safety copy", async () => {
    const directory = mkdtempSync(join(tmpdir(), "egypt-backup-")); const live = join(directory, "live.db"); const copy = join(directory, "copy.db");
    const store = new ResearchStore(live); store.initialize(); store.upsertSource({ slug: "one", name: "مصدر واحد", url: "https://example.org", sourceType: "official", ownershipType: "government", language: "ar" }); store.close();
    await createBackup(live, copy); expect(verifyBackup(copy)).toBe("ok");
    const safety = await restoreBackup(live, copy); expect(safety && existsSync(safety)).toBe(true);
  });
});
