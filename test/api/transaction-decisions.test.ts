import { describe, expect, it } from "vitest";

import { DecideTransaction } from "../../src/application/decide-transaction.js";
import type {
  TransactionDecisionRepository,
  TransactionRecord
} from "../../src/application/ports.js";
import { buildApp } from "../../src/app.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const transactionId = "40000000-0000-4000-8000-000000000001";

class MemoryDecisionRepository implements TransactionDecisionRepository {
  record: TransactionRecord = {
    id: transactionId,
    workspaceId,
    captureId: "20000000-0000-4000-8000-000000000001",
    transactionType: "expense",
    amount: "15000",
    currency: "CRC",
    concept: "Gasolina",
    paymentMethod: "card",
    status: "pending_confirmation",
    confidence: "0.9800"
  };

  async decide(requestWorkspaceId: string, requestTransactionId: string, action: "confirm" | "cancel") {
    if (requestWorkspaceId !== this.record.workspaceId || requestTransactionId !== this.record.id) {
      return null;
    }
    if (this.record.status !== "pending_confirmation") return this.record;
    this.record = {
      ...this.record,
      status: action === "confirm" ? "registered" : "cancelled"
    };
    return this.record;
  }
}

function createDecisionApp() {
  const repository = new MemoryDecisionRepository();
  const decideTransaction = new DecideTransaction(repository);
  return { app: buildApp({ logger: false, decideTransaction }), repository };
}

describe("POST /v1/transactions/:id/decision", () => {
  it("confirms a pending expense inside its workspace", async () => {
    const { app, repository } = createDecisionApp();

    const response = await app.inject({
      method: "POST",
      url: `/v1/transactions/${transactionId}/decision`,
      payload: { workspaceId, action: "confirm" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "registered",
      message: "Gasto confirmado: ₡15.000 CRC en Gasolina."
    });
    expect(repository.record.status).toBe("registered");
    await app.close();
  });

  it("cancels a pending expense and reports the outcome", async () => {
    const { app, repository } = createDecisionApp();

    const response = await app.inject({
      method: "POST",
      url: `/v1/transactions/${transactionId}/decision`,
      payload: { workspaceId, action: "cancel" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "cancelled",
      message: "Gasto cancelado: ₡15.000 CRC en Gasolina."
    });
    expect(repository.record.status).toBe("cancelled");
    await app.close();
  });

  it("does not expose or change another workspace's transaction", async () => {
    const { app, repository } = createDecisionApp();

    const response = await app.inject({
      method: "POST",
      url: `/v1/transactions/${transactionId}/decision`,
      payload: {
        workspaceId: "10000000-0000-4000-8000-000000000099",
        action: "confirm"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      status: "rejected",
      message: "No encontré el gasto pendiente."
    });
    expect(repository.record.status).toBe("pending_confirmation");
    await app.close();
  });
});
