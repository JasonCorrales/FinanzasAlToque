import { eq } from "drizzle-orm";

import type {
  BankSmsCaptureAuditRecord,
  BankSmsCaptureAuditRepository
} from "../../application/ports.js";
import { bankSmsCaptureAudits } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredAudit = typeof bankSmsCaptureAudits.$inferSelect;

export class DrizzleBankSmsCaptureAuditRepository implements BankSmsCaptureAuditRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async saveOrGetAudit(
    input: BankSmsCaptureAuditRecord
  ): Promise<{ audit: BankSmsCaptureAuditRecord; created: boolean }> {
    const [created] = await this.db
      .insert(bankSmsCaptureAudits)
      .values(input)
      .onConflictDoNothing({ target: bankSmsCaptureAudits.captureId })
      .returning();
    if (created) return { audit: this.toRecord(created), created: true };

    const [existing] = await this.db
      .select()
      .from(bankSmsCaptureAudits)
      .where(eq(bankSmsCaptureAudits.captureId, input.captureId))
      .limit(1);
    if (!existing) throw new Error("bank SMS audit conflict did not resolve to an existing record");
    return { audit: this.toRecord(existing), created: false };
  }

  private toRecord(row: StoredAudit): BankSmsCaptureAuditRecord {
    return {
      captureId: row.captureId,
      workspaceId: row.workspaceId,
      messageHash: row.messageHash,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      credentialId: row.credentialId,
      receivedAt: row.receivedAt
    };
  }
}
