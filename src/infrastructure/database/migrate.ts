import { readdir, readFile } from "node:fs/promises";

export interface SqlMigrationClient {
  exec(sql: string): Promise<unknown>;
}

const migrationsUrl = new URL("../../../migrations/", import.meta.url);

export async function applyMigrations(client: SqlMigrationClient): Promise<void> {
  const migrationFiles = (await readdir(migrationsUrl))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migration = await readFile(new URL(file, migrationsUrl), "utf8");
    await client.exec(migration);
  }
}
