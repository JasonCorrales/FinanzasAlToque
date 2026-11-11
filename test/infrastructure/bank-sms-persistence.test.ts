import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleBankSmsCredentialRepository } from "../../src/infrastructure/repositories/drizzle-bank-sms-credential-repository.js";
import { DrizzleBankSmsTemplateRepository } from "../../src/infrastructure/repositories/drizzle-bank-sms-template-repository.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "10000000-0000-4000-8000-000000000002";
const tokenHash = "a".repeat(64);

let client: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await applyMigrations(client);
});

afterEach(async () => {
  await client.close();
});

describe("bank SMS persistence", () => {
  it("applies and replays the bank-SMS migration without changing configured state", async () => {
    const templates = new DrizzleBankSmsTemplateRepository(db);
    await templates.assign({
      workspaceId,
      sender: "+50662229581",
      body: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones",
      version: "coope-ande-v1",
      paymentMethod: "card"
    });

    await applyMigrations(client);

    await expect(templates.resolveActive(workspaceId)).resolves.toMatchObject({
      sender: "+50662229581",
      version: "coope-ande-v1",
      paymentMethod: "card"
    });
  });

  it("looks up only active credentials by SHA-256 hash and scopes last use to its workspace", async () => {
    const credentials = new DrizzleBankSmsCredentialRepository(db);
    const created = await credentials.create({ workspaceId, deviceLabel: "Ana's iPhone", tokenHash });

    await expect(credentials.findActiveByTokenHash(tokenHash)).resolves.toMatchObject({
      id: created.id,
      workspaceId,
      deviceLabel: "Ana's iPhone"
    });
    await expect(credentials.touchLastUsed(otherWorkspaceId, created.id)).resolves.toBeNull();
    await expect(credentials.touchLastUsed(workspaceId, created.id)).resolves.toMatchObject({
      id: created.id,
      lastUsedAt: expect.any(Date)
    });

    await credentials.revoke(workspaceId, created.id);
    await expect(credentials.findActiveByTokenHash(tokenHash)).resolves.toBeNull();
  });

  it("keeps credential lists safe and rejects duplicate token hashes", async () => {
    const credentials = new DrizzleBankSmsCredentialRepository(db);
    await credentials.create({ workspaceId, deviceLabel: "Ana's iPhone", tokenHash });

    await expect(
      credentials.create({
        workspaceId: otherWorkspaceId,
        deviceLabel: "Other iPhone",
        tokenHash
      })
    ).rejects.toThrow();

    const listed = await credentials.listByWorkspace(workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(listed)).not.toContain(tokenHash);
    await expect(credentials.listByWorkspace(otherWorkspaceId)).resolves.toEqual([]);
  });

  it("resolves the complete active workspace template and isolates workspaces", async () => {
    const templates = new DrizzleBankSmsTemplateRepository(db);
    const configuration = {
      sender: "+50662229581",
      body: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones",
      version: "coope-ande-v1",
      paymentMethod: "card"
    };
    await templates.assign({ workspaceId, ...configuration });
    await templates.assign({
      workspaceId: otherWorkspaceId,
      ...configuration,
      version: "coope-ande-v2",
      paymentMethod: "foreign-card"
    });

    await expect(templates.resolveActive(workspaceId)).resolves.toMatchObject({
      workspaceId,
      ...configuration,
      active: true
    });
    await expect(templates.resolveActive("10000000-0000-4000-8000-000000000099")).resolves.toBeNull();
  });

  it("rejects ambiguous active template assignments and storage has no plaintext secrets or SMS body fields", async () => {
    await db.insert(schema.bankSmsTemplates).values({
      workspaceId,
      sender: "+50662229581",
      body: "Template {merchant} amount {amount}",
      version: "v1",
      paymentMethod: "card",
      active: true
    });

    await expect(
      db.insert(schema.bankSmsTemplates).values({
        workspaceId,
        sender: "+50662229581",
        body: "Other {merchant} amount {amount}",
        version: "v2",
        paymentMethod: "card",
        active: true
      })
    ).rejects.toThrow();

    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_name IN ('bank_sms_device_credentials', 'bank_sms_templates')
    `);
    const names = columns.rows.map((column) => `${column.table_name}.${column.column_name}`);
    expect(names).toContain("bank_sms_device_credentials.token_hash");
    expect(names).not.toContain("bank_sms_device_credentials.token");
    expect(names).not.toContain("bank_sms_device_credentials.plaintext_token");
    expect(names).not.toContain("bank_sms_device_credentials.expires_at");
    expect(names.some((name) => name.endsWith(".raw_sms") || name.endsWith(".raw_message"))).toBe(false);
  });
});
