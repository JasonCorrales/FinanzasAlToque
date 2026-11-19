import { and, eq } from "drizzle-orm";

import type {
  BankEmailCaptureAuditRecord,
  BankEmailCaptureAuditRepository
} from "../../application/ports.js";
import { bankEmailCaptureAudits } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredAudit = typeof bankEmailCaptureAudits.$inferSelect;

export class DrizzleBankEmailCaptureAuditRepository implements BankEmailCaptureAuditRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async saveOrGetAudit(
    input: BankEmailCaptureAuditRecord
  ): Promise<{ audit: BankEmailCaptureAuditRecord; created: boolean }> {
    const [created] = await this.db
      .insert(bankEmailCaptureAudits)
      .values(input)
      .onConflictDoNothing({ target: bankEmailCaptureAudits.captureId })
      .returning();
    if (created) return { audit: this.toRecord(created), created: true };

    const [existing] = await this.db
      .select()
      .from(bankEmailCaptureAudits)
      .where(
        and(
          eq(bankEmailCaptureAudits.captureId, input.captureId),
          eq(bankEmailCaptureAudits.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    if (!existing) throw new Error("bank email audit conflict did not resolve to an existing record");
    return { audit: this.toRecord(existing), created: false };
  }

  private toRecord(row: StoredAudit): BankEmailCaptureAuditRecord {
    return {
      captureId: row.captureId,
      workspaceId: row.workspaceId,
      messageHash: row.messageHash,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      redactedMetadata: row.redactedMetadata,
      authenticationResult: row.authenticationResult as BankEmailCaptureAuditRecord["authenticationResult"],
      receivedAt: row.receivedAt
    };
  }
}
