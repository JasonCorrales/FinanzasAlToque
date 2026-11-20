import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleBankEmailCredentialRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-credential-repository.js";
import { DrizzleBankEmailTemplateRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-template-repository.js";

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

async function enablePaymentMethod(workspaceId: string, code: string): Promise<void> {
  await db.insert(schema.paymentMethods).values({
    workspaceId,
    code,
    label: code,
    enabled: true
  });
}

describe("bank email credential and template persistence", () => {
  it("stores hash-only adapter credentials by workspace, revokes them, and never exposes hashes", async () => {
    const credentials = new DrizzleBankEmailCredentialRepository(db);
    const created = await credentials.create({
      workspaceId,
      adapter: "gmail-apps-script",
      tokenHash
    });

    await expect(credentials.findActiveByTokenHash(tokenHash)).resolves.toMatchObject({
      id: created.id,
      workspaceId,
      adapter: "gmail-apps-script",
      active: true
    });
    await expect(credentials.touchLastUsed(otherWorkspaceId, created.id)).resolves.toBeNull();
    await expect(credentials.revoke(otherWorkspaceId, created.id)).resolves.toBeNull();
    await expect(credentials.revoke(workspaceId, created.id)).resolves.toMatchObject({ active: false });
    await expect(credentials.findActiveByTokenHash(tokenHash)).resolves.toBeNull();

    const listed = await credentials.listByWorkspace(workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(listed)).not.toContain(tokenHash);
    await expect(credentials.listByWorkspace(otherWorkspaceId)).resolves.toEqual([]);
  });

  it("rotates an active adapter credential inside its workspace without automatic expiry", async () => {
    const credentials = new DrizzleBankEmailCredentialRepository(db);
    const created = await credentials.create({
      workspaceId,
      adapter: "gmail-apps-script",
      tokenHash
    });

    await expect(
      credentials.create({
        workspaceId,
        adapter: "gmail-apps-script",
        tokenHash: "d".repeat(64)
      })
    ).rejects.toThrow();

    const replacement = await credentials.rotate(workspaceId, created.id, {
      adapter: "gmail-apps-script",
      tokenHash: "b".repeat(64)
    });

    expect(replacement).toMatchObject({ workspaceId, adapter: "gmail-apps-script", active: true });
    expect(replacement?.id).not.toBe(created.id);
    const columns = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'bank_email_adapter_credentials'");
    const names = columns.rows.map((column) => column.column_name);
    expect(names).toContain("token_hash");
    expect(names).not.toEqual(expect.arrayContaining(["token", "plaintext_token", "expires_at"]));
  });

  it("resolves exactly one active BAC template per workspace and source with its enabled payment method", async () => {
    const templates = new DrizzleBankEmailTemplateRepository(db);
    await enablePaymentMethod(workspaceId, "bac-visa");
    await enablePaymentMethod(workspaceId, "bac-visa-new");
    await enablePaymentMethod(otherWorkspaceId, "foreign-card");
    const first = await templates.assign({
      workspaceId,
      source: "bac_purchase",
      version: "bac-email-v1",
      paymentMethod: "bac-visa",
      institution: "BAC",
      cardBrand: "VISA",
      cardLastFour: "4242"
    });
    const replacement = await templates.assign({
      workspaceId,
      source: "bac_purchase",
      version: "bac-email-v2",
      paymentMethod: "bac-visa-new",
      institution: "BAC",
      cardBrand: "VISA",
      cardLastFour: "9999"
    });
    await templates.assign({
      workspaceId: otherWorkspaceId,
      source: "bac_purchase",
      version: "bac-email-v1",
      paymentMethod: "foreign-card",
      institution: "BAC",
      cardBrand: "VISA",
      cardLastFour: "1111"
    });

    await expect(templates.resolveActive(workspaceId, "bac_purchase")).resolves.toMatchObject({
      id: replacement.id,
      workspaceId,
      source: "bac_purchase",
      version: "bac-email-v2",
      paymentMethod: "bac-visa-new",
      institution: "BAC",
      cardBrand: "VISA",
      cardLastFour: "9999",
      active: true
    });
    expect((await templates.listByWorkspace(workspaceId)).find((template) => template.id === first.id)).toMatchObject({ active: false });
    await expect(templates.resolveActive(workspaceId, "other_source")).resolves.toBeNull();
    await expect(
      templates.assign({
        workspaceId, source: "other_source", version: "v1", paymentMethod: "missing",
        institution: "BAC", cardBrand: "VISA", cardLastFour: "4242"
      })
    ).rejects.toThrow();
    await db.insert(schema.paymentMethods).values({
      workspaceId,
      code: "disabled-card",
      label: "disabled-card",
      enabled: false
    });
    await expect(
      templates.assign({
        workspaceId, source: "other_source", version: "v1", paymentMethod: "disabled-card",
        institution: "BAC", cardBrand: "VISA", cardLastFour: "4242"
      })
    ).rejects.toThrow();
    await expect(
      templates.assign({
        workspaceId, source: "other_source", version: "v1", paymentMethod: "foreign-card",
        institution: "BAC", cardBrand: "VISA", cardLastFour: "4242"
      })
    ).rejects.toThrow();
  });
});
