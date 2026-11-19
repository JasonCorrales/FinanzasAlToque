import { and, desc, eq } from "drizzle-orm";

import type {
  AssignBankEmailTemplate,
  BankEmailTemplateRecord,
  BankEmailTemplateRepository
} from "../../application/ports.js";
import { bankEmailTemplates, paymentMethods } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredTemplate = typeof bankEmailTemplates.$inferSelect;

export class DrizzleBankEmailTemplateRepository implements BankEmailTemplateRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async assign(input: AssignBankEmailTemplate): Promise<BankEmailTemplateRecord> {
    return this.db.transaction(async (tx) => {
      const [paymentMethod] = await tx
        .select({ code: paymentMethods.code })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.workspaceId, input.workspaceId),
            eq(paymentMethods.code, input.paymentMethod),
            eq(paymentMethods.enabled, true)
          )
        )
        .limit(1);
      if (!paymentMethod) throw new Error("bank email template payment method is unavailable");

      await tx
        .update(bankEmailTemplates)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(bankEmailTemplates.workspaceId, input.workspaceId),
            eq(bankEmailTemplates.source, input.source),
            eq(bankEmailTemplates.active, true)
          )
        );

      const [template] = await tx.insert(bankEmailTemplates).values(input).returning();
      if (!template) throw new Error("bank email template was not persisted");
      return this.toRecord(template);
    });
  }

  async listByWorkspace(workspaceId: string): Promise<BankEmailTemplateRecord[]> {
    const templates = await this.db
      .select()
      .from(bankEmailTemplates)
      .where(eq(bankEmailTemplates.workspaceId, workspaceId))
      .orderBy(desc(bankEmailTemplates.createdAt));
    return templates.map((template) => this.toRecord(template));
  }

  async resolveActive(workspaceId: string, source: string): Promise<BankEmailTemplateRecord | null> {
    const [template] = await this.db
      .select()
      .from(bankEmailTemplates)
      .where(
        and(
          eq(bankEmailTemplates.workspaceId, workspaceId),
          eq(bankEmailTemplates.source, source),
          eq(bankEmailTemplates.active, true)
        )
      )
      .limit(1);
    return template ? this.toRecord(template) : null;
  }

  private toRecord(row: StoredTemplate): BankEmailTemplateRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      source: row.source,
      version: row.version,
      paymentMethod: row.paymentMethod,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
