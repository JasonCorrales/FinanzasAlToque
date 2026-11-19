import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleBankEmailCaptureAuditRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-capture-audit-repository.js";
import { DrizzleBankEmailCredentialRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-credential-repository.js";
import { DrizzleBankEmailTemplateRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-template-repository.js";
import { DrizzleCaptureRepository } from "../../src/infrastructure/repositories/drizzle-capture-repository.js";

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
  await db.insert(schema.paymentMethods).values({ workspaceId, code, label: code, enabled: true });
}

describe("bank email audit and channel persistence", () => {
  it("accepts only redacted bank_email captures without changing Telegram or bank_sms support", async () => {
    const captures = new DrizzleCaptureRepository(db);
    const inputs = [
      { id: "40000000-0000-4000-8000-000000000001", channel: "telegram" as const },
      { id: "40000000-0000-4000-8000-000000000002", channel: "bank_sms" as const },
      { id: "40000000-0000-4000-8000-000000000003", channel: "bank_email" as const }
    ];

    await Promise.all(
      inputs.map((input) =>
        captures.createOrGet({
          ...input,
          workspaceId,
          externalMessageId: `event-${input.channel}`,
          rawMessage:
            input.channel === "bank_email"
              ? "bank_email:bac_purchase:result=accepted"
              : `${input.channel}:unredacted-content-is-still-supported`,
          status: "received"
        })
      )
    );

    await expect(
      captures.createOrGet({
        id: "40000000-0000-4000-8000-000000000006",
        workspaceId,
        externalMessageId: "event-email-sensitive",
        channel: "bank_email",
        rawMessage: "From: NotificacionBAC@baccredomatic.cr\nVISA: 1234\nAutorización: secret\nReferencia: secret",
        status: "rejected"
      })
    ).rejects.toThrow();

    expect(await client.query<{ channel: string }>("SELECT channel FROM captures ORDER BY channel")).toMatchObject({
      rows: [{ channel: "bank_email" }, { channel: "bank_sms" }, { channel: "telegram" }]
    });
  });

  it("persists workspace-bound privacy-safe audit metadata once and replays migrations safely", async () => {
    const credentials = new DrizzleBankEmailCredentialRepository(db);
    const templates = new DrizzleBankEmailTemplateRepository(db);
    const captures = new DrizzleCaptureRepository(db);
    const audits = new DrizzleBankEmailCaptureAuditRepository(db);
    await credentials.create({ workspaceId, adapter: "gmail-apps-script", tokenHash });
    await enablePaymentMethod(workspaceId, "bac-visa");
    await enablePaymentMethod(otherWorkspaceId, "foreign-card");
    const template = await templates.assign({ workspaceId, source: "bac_purchase", version: "bac-email-v1", paymentMethod: "bac-visa" });
    const capture = await captures.createOrGet({
      id: "40000000-0000-4000-8000-000000000004",
      workspaceId,
      externalMessageId: "event-email-1",
      channel: "bank_email",
      rawMessage: "bank_email:bac_purchase:result=accepted",
      status: "received"
    });
    const input = {
      captureId: capture.id,
      workspaceId,
      messageHash: `sha256:v1:${"c".repeat(64)}`,
      templateId: template.id,
      templateVersion: template.version,
      redactedMetadata: "bank_email:bac_purchase:channel=bank_email:result=purchase",
      authenticationResult: "passed" as const,
      receivedAt: new Date("2026-03-01T12:00:00.000Z")
    };

    expect(await audits.saveOrGetAudit(input)).toMatchObject({ created: true, audit: input });
    expect(await audits.saveOrGetAudit(input)).toMatchObject({ created: false, audit: input });
    await expect(audits.saveOrGetAudit({ ...input, workspaceId: otherWorkspaceId })).rejects.toThrow(
      "bank email audit conflict did not resolve to an existing record"
    );
    const foreignTemplate = await templates.assign({
      workspaceId: otherWorkspaceId,
      source: "bac_purchase",
      version: "bac-email-v1",
      paymentMethod: "foreign-card"
    });
    await captures.createOrGet({
      id: "40000000-0000-4000-8000-000000000007",
      workspaceId,
      externalMessageId: "event-email-foreign-template",
      channel: "bank_email",
      rawMessage: "bank_email:bac_purchase:result=rejected",
      status: "rejected"
    });
    await expect(
      db.insert(schema.bankEmailCaptureAudits).values({
        ...input,
        captureId: "40000000-0000-4000-8000-000000000007",
        templateId: foreignTemplate.id
      })
    ).rejects.toThrow();
    await captures.createOrGet({
      id: "40000000-0000-4000-8000-000000000005",
      workspaceId,
      externalMessageId: "event-email-invalid-auth",
      channel: "bank_email",
      rawMessage: "bank_email:bac_purchase:result=rejected",
      status: "rejected"
    });
    await expect(
      db.insert(schema.bankEmailCaptureAudits).values({
        ...input,
        captureId: "40000000-0000-4000-8000-000000000005",
        authenticationResult: "unknown"
      })
    ).rejects.toThrow();
    await applyMigrations(client);

    const columns = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'bank_email_capture_audits'");
    const names = columns.rows.map((column) => column.column_name);
    expect(names).toEqual(expect.arrayContaining(["message_hash", "template_id", "template_version", "redacted_metadata", "authentication_result", "received_at"]));
    expect(names).not.toEqual(expect.arrayContaining(["sender", "subject", "body", "merchant", "amount", "currency", "card", "authorization", "reference", "customer_name", "token"]));
  });
});
