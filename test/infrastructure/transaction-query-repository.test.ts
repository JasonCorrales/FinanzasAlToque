import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleTransactionQueryRepository } from "../../src/infrastructure/repositories/drizzle-transaction-query-repository.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "10000000-0000-4000-8000-000000000002";
const from = new Date("2025-01-01T00:00:00.000Z");
const to = new Date("2025-02-01T00:00:00.000Z");

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

async function insertTransaction(input: {
  id: string;
  captureId: string;
  workspaceId?: string;
  amount: string;
  currency: string;
  paymentMethod?: string;
  status?: "registered" | "pending_confirmation" | "cancelled";
  createdAt: Date;
}) {
  const workspace = input.workspaceId ?? workspaceId;
  const paymentMethod = input.paymentMethod ?? "card";
  await db.insert(schema.paymentMethods).values({ workspaceId: workspace, code: paymentMethod, label: paymentMethod })
    .onConflictDoNothing();
  await db.insert(schema.captures).values({
    id: input.captureId,
    workspaceId: workspace,
    externalMessageId: input.captureId,
    channel: "telegram",
    rawMessage: "private source message",
    status: "processed"
  });
  await db.insert(schema.transactions).values({
    id: input.id,
    workspaceId: workspace,
    captureId: input.captureId,
    transactionType: "expense",
    amount: input.amount,
    currency: input.currency,
    concept: `Concept ${input.id}`,
    paymentMethod,
    status: input.status ?? "registered",
    confidence: "1.0000",
    createdAt: input.createdAt
  });
}

describe("DrizzleTransactionQueryRepository", () => {
  it("pages only matching registered workspace expenses in stable descending creation order", async () => {
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000001", captureId: "20000000-0000-4000-8000-000000000001", amount: "10.100000", currency: "CRC", createdAt: new Date("2025-01-20T10:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000002", captureId: "20000000-0000-4000-8000-000000000002", amount: "20.200000", currency: "CRC", createdAt: new Date("2025-01-20T10:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000003", captureId: "20000000-0000-4000-8000-000000000003", amount: "3.300000", currency: "USD", createdAt: new Date("2025-01-10T10:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000004", captureId: "20000000-0000-4000-8000-000000000004", amount: "99.000000", currency: "CRC", status: "pending_confirmation", createdAt: new Date("2025-01-12T10:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000005", captureId: "20000000-0000-4000-8000-000000000005", amount: "88.000000", currency: "CRC", status: "cancelled", createdAt: new Date("2025-01-13T10:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000007", captureId: "20000000-0000-4000-8000-000000000007", workspaceId: otherWorkspaceId, amount: "500.000000", currency: "CRC", createdAt: new Date("2025-01-19T10:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000006", captureId: "20000000-0000-4000-8000-000000000006", amount: "7.000000", currency: "CRC", createdAt: new Date("2025-02-01T00:00:00.000Z") });

    const repository = new DrizzleTransactionQueryRepository(db);
    const firstPage = await repository.queryRegisteredExpenses({ workspaceId, from, to, limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual([
      "40000000-0000-4000-8000-000000000002",
      "40000000-0000-4000-8000-000000000001"
    ]);
    expect(firstPage.items[0]).toEqual({
      id: "40000000-0000-4000-8000-000000000002",
      amount: "20.200000",
      currency: "CRC",
      concept: "Concept 40000000-0000-4000-8000-000000000002",
      paymentMethod: "card",
      createdAt: new Date("2025-01-20T10:00:00.000Z")
    });
    expect(firstPage.totalCount).toBe(3);
    expect(firstPage.totalsByCurrency).toEqual([
      { currency: "CRC", amount: "30.300000" },
      { currency: "USD", amount: "3.300000" }
    ]);
    expect(firstPage.nextCursor).toEqual({
      createdAt: new Date("2025-01-20T10:00:00.000Z"),
      id: "40000000-0000-4000-8000-000000000001"
    });

    const secondPage = await repository.queryRegisteredExpenses({
      workspaceId,
      from,
      to,
      limit: 2,
      cursor: firstPage.nextCursor!
    });
    expect(secondPage.items.map((item) => item.id)).toEqual(["40000000-0000-4000-8000-000000000003"]);
    expect(secondPage.totalCount).toBe(3);
    expect(secondPage.totalsByCurrency).toEqual(firstPage.totalsByCurrency);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("applies the canonical payment-method filter to items, count, and currency totals", async () => {
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000010", captureId: "20000000-0000-4000-8000-000000000010", amount: "12.250000", currency: "CRC", paymentMethod: "card", createdAt: new Date("2025-01-10T00:00:00.000Z") });
    await insertTransaction({ id: "40000000-0000-4000-8000-000000000011", captureId: "20000000-0000-4000-8000-000000000011", amount: "9.990000", currency: "USD", paymentMethod: "cash", createdAt: new Date("2025-01-11T00:00:00.000Z") });

    const result = await new DrizzleTransactionQueryRepository(db).queryRegisteredExpenses({
      workspaceId,
      from,
      to,
      limit: 100,
      paymentMethod: "card"
    });

    expect(result.items.map((item) => item.paymentMethod)).toEqual(["card"]);
    expect(result.totalCount).toBe(1);
    expect(result.totalsByCurrency).toEqual([{ currency: "CRC", amount: "12.250000" }]);
  });
});
