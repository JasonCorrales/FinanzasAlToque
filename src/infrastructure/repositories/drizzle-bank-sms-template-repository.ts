import { and, desc, eq } from "drizzle-orm";

import type {
  AssignBankSmsTemplate,
  BankSmsTemplateRecord,
  BankSmsTemplateRepository
} from "../../application/ports.js";
import { bankSmsTemplates } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredTemplate = typeof bankSmsTemplates.$inferSelect;

export class DrizzleBankSmsTemplateRepository implements BankSmsTemplateRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async assign(input: AssignBankSmsTemplate): Promise<BankSmsTemplateRecord> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(bankSmsTemplates)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(eq(bankSmsTemplates.workspaceId, input.workspaceId), eq(bankSmsTemplates.active, true))
        );

      const [template] = await tx.insert(bankSmsTemplates).values(input).returning();
      if (!template) throw new Error("bank SMS template was not persisted");
      return this.toRecord(template);
    });
  }

  async listByWorkspace(workspaceId: string): Promise<BankSmsTemplateRecord[]> {
    const templates = await this.db
      .select()
      .from(bankSmsTemplates)
      .where(eq(bankSmsTemplates.workspaceId, workspaceId))
      .orderBy(desc(bankSmsTemplates.createdAt));
    return templates.map((template) => this.toRecord(template));
  }

  async resolveActive(workspaceId: string): Promise<BankSmsTemplateRecord | null> {
    const [template] = await this.db
      .select()
      .from(bankSmsTemplates)
      .where(
        and(eq(bankSmsTemplates.workspaceId, workspaceId), eq(bankSmsTemplates.active, true))
      )
      .limit(1);
    return template ? this.toRecord(template) : null;
  }

  private toRecord(row: StoredTemplate): BankSmsTemplateRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      sender: row.sender,
      body: row.body,
      version: row.version,
      paymentMethod: row.paymentMethod,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
