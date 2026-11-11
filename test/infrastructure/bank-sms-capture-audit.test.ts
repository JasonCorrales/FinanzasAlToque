import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleBankSmsCaptureAuditRepository } from "../../src/infrastructure/repositories/drizzle-bank-sms-capture-audit-repository.js";
import { DrizzleBankSmsCredentialRepository } from "../../src/infrastructure/repositories/drizzle-bank-sms-credential-repository.js";
import { DrizzleBankSmsTemplateRepository } from "../../src/infrastructure/repositories/drizzle-bank-sms-template-repository.js";
import { DrizzleCaptureRepository } from "../../src/infrastructure/repositories/drizzle-capture-repository.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
let client: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await applyMigrations(client);
});
afterEach(async () => { await client.close(); });

describe("bank SMS capture audit persistence", () => {
  it("stores only versioned audit metadata once for a bank_sms capture and replays migration safely", async () => {
    const credentials = new DrizzleBankSmsCredentialRepository(db);
    const templates = new DrizzleBankSmsTemplateRepository(db);
    const captures = new DrizzleCaptureRepository(db);
    const audits = new DrizzleBankSmsCaptureAuditRepository(db);
    const credential = await credentials.create({ workspaceId, deviceLabel: "iPhone", tokenHash: "a".repeat(64) });
    const template = await templates.assign({ workspaceId, sender: "+50662229581", body: "Coope Ande {merchant} {amount}", version: "v1", paymentMethod: "card" });
    const capture = await captures.createOrGet({ id: "40000000-0000-4000-8000-000000000001", workspaceId, externalMessageId: "event-1", channel: "bank_sms", rawMessage: "bank_sms:coope_ande_purchase:sender=+50662229581:merchant_length=3:amount_crc=10", status: "received" });
    const input = { captureId: capture.id, workspaceId, messageHash: `sha256:v1:${"b".repeat(64)}`, templateId: template.id, templateVersion: template.version, credentialId: credential.id, receivedAt: new Date("2026-03-01T12:00:00.000Z") };

    expect(await audits.saveOrGetAudit(input)).toMatchObject({ created: true, audit: input });
    expect(await audits.saveOrGetAudit(input)).toMatchObject({ created: false, audit: input });
    await applyMigrations(client);
    const columns = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'bank_sms_capture_audits'");
    expect(columns.rows.map((column) => column.column_name)).toEqual(expect.arrayContaining(["message_hash", "template_id", "template_version", "credential_id", "received_at"]));
    expect(columns.rows.map((column) => column.column_name)).not.toEqual(expect.arrayContaining(["message", "sender", "token"]));
  });
});
