import { and, count, desc, eq, gte, lt, or, sql } from "drizzle-orm";

import type {
  RegisteredExpenseQueryInput,
  RegisteredExpenseQueryRepository,
  RegisteredExpenseQueryResult
} from "../../application/ports.js";
import { transactions } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

export class DrizzleTransactionQueryRepository implements RegisteredExpenseQueryRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async queryRegisteredExpenses(
    input: RegisteredExpenseQueryInput
  ): Promise<RegisteredExpenseQueryResult> {
    const filters = this.filters(input);
    const pageFilters = input.cursor
      ? and(
          filters,
          or(
            lt(transactions.createdAt, input.cursor.createdAt),
            and(eq(transactions.createdAt, input.cursor.createdAt), lt(transactions.id, input.cursor.id))
          )
        )
      : filters;

    const [pageRows, countRows, totalsByCurrency] = await Promise.all([
      this.db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          currency: transactions.currency,
          concept: transactions.concept,
          paymentMethod: transactions.paymentMethod,
          createdAt: transactions.createdAt
        })
        .from(transactions)
        .where(pageFilters)
        .orderBy(desc(transactions.createdAt), desc(transactions.id))
        .limit(input.limit + 1),
      this.db.select({ totalCount: count() }).from(transactions).where(filters),
      this.db
        .select({
          currency: transactions.currency,
          amount: sql<string>`sum(${transactions.amount})`
        })
        .from(transactions)
        .where(filters)
        .groupBy(transactions.currency)
        .orderBy(transactions.currency)
    ]);

    const hasNextPage = pageRows.length > input.limit;
    const items = pageRows.slice(0, input.limit);
    const lastItem = items.at(-1);

    return {
      items,
      totalCount: countRows[0]?.totalCount ?? 0,
      totalsByCurrency,
      nextCursor: hasNextPage && lastItem
        ? { createdAt: lastItem.createdAt, id: lastItem.id }
        : null
    };
  }

  private filters(input: RegisteredExpenseQueryInput) {
    return and(
      eq(transactions.workspaceId, input.workspaceId),
      eq(transactions.transactionType, "expense"),
      eq(transactions.status, "registered"),
      gte(transactions.createdAt, input.from),
      lt(transactions.createdAt, input.to),
      input.paymentMethod === undefined
        ? undefined
        : eq(transactions.paymentMethod, input.paymentMethod)
    );
  }
}
