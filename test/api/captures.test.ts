import { describe, expect, it } from "vitest";

import { ProcessCapture } from "../../src/application/process-capture.js";
import type {
  CaptureRecord,
  CaptureRepository,
  ConfirmationPolicyRecord,
  ConfirmationPolicyRepository,
  TransactionRecord,
  TransactionRepository
} from "../../src/application/ports.js";
import { buildApp } from "../../src/app.js";
import { SpanishExpenseInterpreter } from "../../src/infrastructure/interpreters/spanish-expense-interpreter.js";

class MemoryStore
  implements CaptureRepository, ConfirmationPolicyRepository, TransactionRepository
{
  captures = new Map<string, CaptureRecord>();
  transactions = new Map<string, TransactionRecord>();
  policy: ConfirmationPolicyRecord = {
    channel: "telegram",
    mode: "never_confirm",
    confidenceThreshold: null
  };

  async createOrGet(input: CaptureRecord) {
    const key = `${input.workspaceId}:${input.channel}:${input.externalMessageId}`;
    const existing = this.captures.get(key);
    if (existing) return existing;
    this.captures.set(key, input);
    return input;
  }

  async findByCaptureId(workspaceId: string, captureId: string) {
    return this.transactions.get(`${workspaceId}:${captureId}`) ?? null;
  }

  async save(input: TransactionRecord) {
    this.transactions.set(`${input.workspaceId}:${input.captureId}`, input);
    return input;
  }

  async findByWorkspaceAndChannel() {
    return this.policy;
  }
}

function createTestApp() {
  const store = new MemoryStore();
  let sequence = 0;
  const processCapture = new ProcessCapture({
    captures: store,
    transactions: store,
    confirmationPolicies: store,
    interpreter: new SpanishExpenseInterpreter(),
    nextId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
  });
  return { app: buildApp({ logger: false, processCapture }), store };
}

const validPayload = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  externalMessageId: "telegram-42",
  channel: "telegram",
  message: "Gaste 15.000 colones en Gasolina pague con Tarjeta"
};

describe("POST /v1/captures", () => {
  it("registers the accepted Spanish expense and explains the outcome", async () => {
    const { app, store } = createTestApp();

    const response = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "registered",
      message: "Gasto registrado: ₡15.000 CRC en Gasolina con Tarjeta.",
      transaction: {
        transactionType: "expense",
        amount: "15000",
        currency: "CRC",
        concept: "Gasolina",
        paymentMethod: "card"
      }
    });
    expect(store.transactions.size).toBe(1);
    expect([...store.captures.values()][0]?.rawMessage).toBe(validPayload.message);
    await app.close();
  });

  it("does not duplicate a transaction when Telegram delivers the same message twice", async () => {
    const { app, store } = createTestApp();

    const first = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });
    const repeated = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual(first.json());
    expect(store.captures.size).toBe(1);
    expect(store.transactions.size).toBe(1);
    await app.close();
  });

  it("explains missing required information and leaves transactions unchanged", async () => {
    const { app, store } = createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: { ...validPayload, externalMessageId: "telegram-43", message: "Gaste en Gasolina" }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      status: "needs_information",
      message: "No registré el gasto. Faltan: monto, moneda y medio de pago.",
      missingFields: ["amount", "currency", "paymentMethod"]
    });
    expect(store.transactions.size).toBe(0);
    await app.close();
  });
});
