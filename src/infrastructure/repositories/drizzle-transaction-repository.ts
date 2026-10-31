import { and, eq } from "drizzle-orm";

import type {
  TransactionRecord,
  TransactionRepository
} from "../../application/ports.js";
import { transactions } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredTransaction = typeof transactions.$inferSelect;

export class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async saveOrGet(
    input: TransactionRecord
  ): Promise<{ transaction: TransactionRecord; created: boolean }> {
    const [created] = await this.db
      .insert(transactions)
      .values(input)
      .onConflictDoNothing({ target: transactions.captureId })
      .returning();

    if (created) {
      return { transaction: this.toRecord(created), created: true };
    }

    const existing = await this.findByCaptureId(input.workspaceId, input.captureId);
    if (!existing) {
      throw new Error("transaction conflict did not resolve to an existing record");
    }

    return { transaction: existing, created: false };
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

    return transaction ? this.toRecord(transaction) : null;
  }

  async count(): Promise<number> {
    return this.db.$count(transactions);
  }

  private toRecord(row: StoredTransaction): TransactionRecord {
    if (
      row.transactionType !== "expense" ||
      !["registered", "pending_confirmation"].includes(row.status)
    ) {
      throw new Error("stored transaction has an unsupported type or status");
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      captureId: row.captureId,
      transactionType: "expense",
      amount: row.amount,
      currency: row.currency,
      concept: row.concept,
      paymentMethod: row.paymentMethod,
      status: row.status as TransactionRecord["status"],
      confidence: row.confidence
    };
  }
}
