import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("transaction amount scale alignment", () => {
  it("declares numeric(20,2) in Drizzle and migrates existing amounts once", async () => {
    const [schema, migration] = await Promise.all([
      readFile(new URL("../../src/infrastructure/database/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../../migrations/0007_transaction_amount_scale.sql", import.meta.url), "utf8")
    ]);

    expect(schema).toMatch(
      /amount:\s*numeric\(\s*"amount"\s*,\s*\{\s*precision:\s*20\s*,\s*scale:\s*2\s*}\s*\)/
    );
    expect(migration).toMatch(/DO\s+\$migration\$/i);
    expect(migration).toMatch(
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+app_migrations\s+WHERE\s+version\s*=\s*'0007_transaction_amount_scale'\s*\)/i
    );
    expect(migration).toMatch(
      /ALTER\s+TABLE\s+transactions\s+ALTER\s+COLUMN\s+amount\s+TYPE\s+numeric\s*\(\s*20\s*,\s*2\s*\)\s+USING\s+round\s*\(\s*amount\s*,\s*2\s*\)/i
    );
    expect(migration).toMatch(
      /INSERT\s+INTO\s+app_migrations\s*\(\s*version\s*\)\s+VALUES\s*\(\s*'0007_transaction_amount_scale'\s*\)/i
    );
    expect(migration.indexOf("ALTER TABLE")).toBeLessThan(migration.indexOf("INSERT INTO app_migrations"));
  });
});
