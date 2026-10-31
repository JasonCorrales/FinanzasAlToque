import { and, eq } from "drizzle-orm";

import { transactions } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type TransactionInsert = typeof transactions.$inferInsert;
type TransactionRecord = typeof transactions.$inferSelect;

export class DrizzleTransactionRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async save(input: TransactionInsert): Promise<TransactionRecord> {
    const [transaction] = await this.db.insert(transactions).values(input).returning();

    if (!transaction) {
      throw new Error("transaction was not persisted");
    }

    return transaction;
  }

  async findByCaptureId(
    workspaceId: string,
    captureId: string
  ): Promise<TransactionRecord | null> {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.captureId, captureId)
        )
      )
      .limit(1);

    return transaction ?? null;
  }

  async count(): Promise<number> {
    return this.db.$count(transactions);
  }
}
