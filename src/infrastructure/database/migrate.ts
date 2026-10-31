import { readFile } from "node:fs/promises";

export interface SqlMigrationClient {
  exec(sql: string): Promise<unknown>;
}

const initialMigrationUrl = new URL("../../../migrations/0001_initial.sql", import.meta.url);

export async function applyMigrations(client: SqlMigrationClient): Promise<void> {
  const migration = await readFile(initialMigrationUrl, "utf8");
  await client.exec(migration);
}
