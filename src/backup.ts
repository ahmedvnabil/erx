import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export function verifyBackup(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`Backup does not exist: ${absolute}`);
  const database = new DatabaseSync(absolute, { readOnly: true });
  try {
    const result = String((database.prepare("PRAGMA integrity_check").get() as Record<string, unknown>)["integrity_check"] ?? "");
    if (result !== "ok") throw new Error(`Backup integrity check failed: ${result}`);
    return result;
  } finally { database.close(); }
}

export async function createBackup(databasePath: string, destination: string): Promise<string> {
  const sourcePath = resolve(databasePath); const targetPath = resolve(destination);
  if (sourcePath === targetPath) throw new Error("Backup destination must differ from the live database");
  if (!existsSync(sourcePath)) throw new Error(`Database does not exist: ${sourcePath}`);
  mkdirSync(dirname(targetPath), { recursive: true });
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try { await backup(source, targetPath); } finally { source.close(); }
  verifyBackup(targetPath);
  return targetPath;
}

export async function restoreBackup(databasePath: string, sourcePath: string): Promise<string | null> {
  verifyBackup(sourcePath);
  const live = resolve(databasePath);
  let safety: string | null = null;
  if (existsSync(live)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    safety = live.replace(/\.db$/, "") + `.pre-restore-${stamp}.db`;
    await createBackup(live, safety);
  } else mkdirSync(dirname(live), { recursive: true });
  const source = new DatabaseSync(resolve(sourcePath), { readOnly: true });
  try { await backup(source, live); } finally { source.close(); }
  verifyBackup(live);
  return safety;
}
