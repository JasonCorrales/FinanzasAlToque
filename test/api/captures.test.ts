import { describe, expect, it } from "vitest";

import { ProcessCapture } from "../../src/application/process-capture.js";
import type {
  CaptureRecord,
  CaptureRepository,
  ConfirmationPolicyRecord,
  ConfirmationPolicyRepository,
  PaymentMethodCatalogRepository,
  PaymentMethodRecord,
  TransactionRecord,
  TransactionRepository
} from "../../src/application/ports.js";
import { buildApp } from "../../src/http-app.js";
import { SpanishExpenseInterpreter } from "../../src/infrastructure/interpreters/spanish-expense-interpreter.js";

class MemoryStore
  implements
    CaptureRepository,
    ConfirmationPolicyRepository,
    PaymentMethodCatalogRepository,
    TransactionRepository
{
  captures = new Map<string, CaptureRecord>();
  paymentMethods = new Map<string, PaymentMethodRecord>();
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

  async saveOrGet(input: TransactionRecord) {
    const key = `${input.workspaceId}:${input.captureId}`;
    const existing = this.transactions.get(key);
    if (existing) return { transaction: existing, created: false };
    this.transactions.set(key, input);
    return { transaction: input, created: true };
  }

  async findByWorkspaceAndChannel() {
    return this.policy;
  }

  async findEnabled(workspaceId: string, input: string) {
    const normalized = input.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
    const matches = [...this.paymentMethods.values()].filter((method) =>
      method.workspaceId === workspaceId
      && method.enabled
      && [method.code, method.label].some((value) =>
        value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() === normalized
      )
    );
    return matches.length === 1 ? matches[0]! : null;
  }
}

function createTestApp() {
  const store = new MemoryStore();
  store.paymentMethods.set(`${validPayload.workspaceId}:card`, {
    workspaceId: validPayload.workspaceId,
    code: "card",
    label: "Tarjeta",
    enabled: true
  });
  let sequence = 0;
  const processCapture = new ProcessCapture({
    captures: store,
    transactions: store,
    confirmationPolicies: store,
    paymentMethods: store,
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

  it("returns confirmation actions when the Telegram channel policy requires confirmation", async () => {
    const { app, store } = createTestApp();
    store.policy = { channel: "telegram", mode: "always_confirm", confidenceThreshold: null };

    const response = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "pending_confirmation",
      message: "Interpreté un gasto de ₡15.000 CRC en Gasolina con Tarjeta. ¿Querés registrarlo?",
      actions: ["confirm", "cancel"]
    });
    expect([...store.transactions.values()][0]?.status).toBe("pending_confirmation");
    await app.close();
  });

  it("does not duplicate a transaction when Telegram delivers the same message twice", async () => {
    const { app, store } = createTestApp();

    const first = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });
    const repeated = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(first.statusCode).toBe(201);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({
      status: "registered",
      duplicate: true,
      message: "Este gasto ya estaba registrado: ₡15.000 CRC en Gasolina con Tarjeta."
    });
    expect(store.captures.size).toBe(1);
    expect(store.transactions.size).toBe(1);
    await app.close();
  });

  it("handles concurrent repeated delivery without an error or duplicate transaction", async () => {
    const { app, store } = createTestApp();

    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/v1/captures", payload: validPayload }),
      app.inject({ method: "POST", url: "/v1/captures", payload: validPayload })
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201]);
    expect(store.transactions.size).toBe(1);
    expect([first.json(), second.json()]).toEqual(
      expect.arrayContaining([expect.objectContaining({ duplicate: true })])
    );
    await app.close();
  });

  it("rejects a payment method that is not enabled in the workspace catalog", async () => {
    const { app, store } = createTestApp();
    store.paymentMethods.clear();

    const response = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      status: "needs_information",
      message: "No registré el gasto. Falta un medio de pago válido.",
      missingFields: ["paymentMethod"]
    });
    expect(store.transactions.size).toBe(0);
    await app.close();
  });

  it("does not accept a payment method enabled only for another workspace", async () => {
    const { app, store } = createTestApp();
    store.paymentMethods.clear();
    store.paymentMethods.set("other:card", {
      workspaceId: "10000000-0000-4000-8000-000000000099",
      code: "card",
      label: "Tarjeta",
      enabled: true
    });

    const response = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      status: "needs_information",
      missingFields: ["paymentMethod"]
    });
    expect(store.transactions.size).toBe(0);
    await app.close();
  });

  it("accepts a maintained catalog label and persists its canonical code", async () => {
    const { app, store } = createTestApp();
    store.paymentMethods.set(`${validPayload.workspaceId}:sinpe`, {
      workspaceId: validPayload.workspaceId,
      code: "sinpe",
      label: "Sinpe Móvil",
      enabled: true
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: {
        ...validPayload,
        externalMessageId: "telegram-sinpe",
        message: "Gaste 15.000 colones en Gasolina pague con Sinpe Movil"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "registered",
      transaction: { paymentMethod: "sinpe" }
    });
    expect([...store.transactions.values()][0]?.paymentMethod).toBe("sinpe");
    await app.close();
  });

  it("accepts the common payment phrase at the public capture interface", async () => {
    const { app, store } = createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: {
        ...validPayload,
        externalMessageId: "telegram-common-payment-phrase",
        message: "Pagué 15.000 colones en Gasolina con Tarjeta"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "registered",
      transaction: { concept: "Gasolina", paymentMethod: "card" }
    });
    expect(store.transactions.size).toBe(1);
    await app.close();
  });

  it("rejects an ambiguous enabled catalog match without persisting a transaction", async () => {
    const { app, store } = createTestApp();
    store.paymentMethods.set(`${validPayload.workspaceId}:tarjeta`, {
      workspaceId: validPayload.workspaceId,
      code: "tarjeta",
      label: "Crédito",
      enabled: true
    });

    const response = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      status: "needs_information",
      missingFields: ["paymentMethod"]
    });
    expect(store.transactions.size).toBe(0);
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
