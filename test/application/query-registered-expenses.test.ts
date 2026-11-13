import { describe, expect, it } from "vitest";

import type {
  RegisteredExpenseQueryInput,
  RegisteredExpenseQueryRepository,
  RegisteredExpenseQueryResult
} from "../../src/application/ports.js";
import { QueryRegisteredExpenses } from "../../src/application/query-registered-expenses.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const from = new Date("2025-01-01T00:00:00.000Z");
const to = new Date("2025-02-01T00:00:00.000Z");

class QueryRepository implements RegisteredExpenseQueryRepository {
  calls: RegisteredExpenseQueryInput[] = [];

  async queryRegisteredExpenses(
    input: Parameters<RegisteredExpenseQueryRepository["queryRegisteredExpenses"]>[0]
  ): Promise<RegisteredExpenseQueryResult> {
    this.calls.push(input);
    return {
      items: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          amount: "1234.560000",
          currency: "CRC",
          concept: "Supermercado",
          paymentMethod: "card",
          createdAt: new Date("2025-01-15T12:00:00.000Z")
        }
      ],
      totalCount: 1,
      totalsByCurrency: [{ currency: "CRC", amount: "1234.560000" }],
      nextCursor: null
    };
  }
}

describe("QueryRegisteredExpenses", () => {
  it("returns the registered expense page and decimal-string totals from its read-only port", async () => {
    const repository = new QueryRepository();
    const query = new QueryRegisteredExpenses(repository);

    await expect(query.execute({ workspaceId, from, to, limit: 20, paymentMethod: "card" })).resolves.toEqual({
      items: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          amount: "1234.560000",
          currency: "CRC",
          concept: "Supermercado",
          paymentMethod: "card",
          createdAt: new Date("2025-01-15T12:00:00.000Z")
        }
      ],
      totalCount: 1,
      totalsByCurrency: [{ currency: "CRC", amount: "1234.560000" }],
      nextCursor: null
    });
    expect(repository.calls).toEqual([{ workspaceId, from, to, limit: 20, paymentMethod: "card" }]);
  });

  it.each([
    { from: to, to, limit: 20 },
    { from, to: from, limit: 20 },
    { from: new Date("invalid"), to, limit: 20 },
    { from, to, limit: 0 },
    { from, to, limit: 101 },
    { from, to, limit: 1.5 },
    { from, to, limit: 20, paymentMethod: " " },
    { from, to, limit: 20, paymentMethod: " card " },
    { from, to, limit: 20, cursor: { createdAt: new Date("invalid"), id: "40000000-0000-4000-8000-000000000001" } },
    { from, to, limit: 20, cursor: { createdAt: new Date(), id: "" } },
    { from, to, limit: 20, cursor: { createdAt: new Date(), id: "not-a-uuid" } }
  ])("rejects invalid input before querying", async (input) => {
    const repository = new QueryRepository();
    const query = new QueryRegisteredExpenses(repository);

    await expect(query.execute({ workspaceId, ...input })).rejects.toThrow("Invalid registered expense query");
    expect(repository.calls).toEqual([]);
  });
});
