import { describe, expect, it } from "vitest";

import {
  BankSmsAuthenticationError,
  BankSmsConfigurationError,
  BankSmsValidationError
} from "../../src/application/bank-sms-errors.js";
import type { ProcessBankSmsCapture } from "../../src/application/process-bank-sms-capture.js";
import { buildApp } from "../../src/http-app.js";

const token = "bank-sms-token-which-is-long-enough-123456";
const payload = {
  eventId: "bank-event-42",
  sender: "+506 6222-9581",
  message: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Super Mercado por 5,300.00 colones",
  receivedAt: "2026-03-01T12:00:00.000Z"
};

function createUseCase() {
  const calls: unknown[] = [];
  const useCase = {
    async execute(input: unknown) {
      calls.push(input);
      return {
        status: "registered" as const,
        duplicate: false,
        transactionId: "40000000-0000-4000-8000-000000000001",
        transaction: {
          transactionType: "expense" as const,
          amount: "5300",
          currency: "CRC",
          concept: "Super Mercado",
          paymentMethod: "card",
          status: "registered" as const,
          confidence: 1
        }
      };
    }
  } as ProcessBankSmsCapture;
  return { calls, useCase };
}

function request(app: ReturnType<typeof buildApp>, authorization = `Bearer ${token}`, body: unknown = payload) {
  return app.inject({
    method: "POST",
    url: "/v1/bank-sms/captures",
    headers: { "content-type": "application/json", ...(authorization === "" ? {} : { authorization }) },
    payload: JSON.stringify(body)
  });
}

describe("POST /v1/bank-sms/captures", () => {
  it("registers a bank SMS with one Bearer credential and exposes only the Shortcut-safe outcome", async () => {
    const { calls, useCase } = createUseCase();
    const app = buildApp({ logger: false, processBankSmsCapture: useCase });

    const response = await request(app);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      status: "registered",
      duplicate: false,
      transactionId: "40000000-0000-4000-8000-000000000001",
      transaction: {
        amount: "5300",
        currency: "CRC",
        concept: "Super Mercado",
        paymentMethod: "card"
      }
    });
    expect(calls).toEqual([{
      token,
      eventId: payload.eventId,
      sender: payload.sender,
      message: payload.message,
      receivedAt: new Date(payload.receivedAt)
    }]);
    await app.close();
  });

  it("defaults receivedAt to the server clock and returns 200 for idempotent duplicates", async () => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => {
      calls.push(input);
      return {
        status: "registered", duplicate: true, transactionId: "40000000-0000-4000-8000-000000000001",
        transaction: { transactionType: "expense", amount: "5300", currency: "CRC", concept: "Super Mercado", paymentMethod: "card", status: "registered", confidence: 1 }
      };
    }; 
    const app = buildApp({ logger: false, processBankSmsCapture: useCase });

    const response = await request(app, `Bearer ${token}`, { ...payload, eventId: "bank-event-43", receivedAt: undefined });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "registered", duplicate: true, transactionId: "40000000-0000-4000-8000-000000000001",
      transaction: { amount: "5300", currency: "CRC", concept: "Super Mercado", paymentMethod: "card" }
    });
    expect(calls).toHaveLength(1);
    expect((calls[0] as { receivedAt: Date }).receivedAt).toBeInstanceOf(Date);
    await app.close();
  });

  it.each(["", "Basic credential", "Bearer", "Bearer one two"]) (
    "rejects missing or malformed credentials without calling the use case: %s",
    async (authorization) => {
      const { calls, useCase } = createUseCase();
      const app = buildApp({ logger: false, processBankSmsCapture: useCase });

      const response = await request(app, authorization);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
      expect(calls).toHaveLength(0);
      await app.close();
    }
  );

  it("rejects multiple Authorization credentials without calling the use case", async () => {
    const { calls, useCase } = createUseCase();
    const app = buildApp({ logger: false, processBankSmsCapture: useCase });

    const response = await app.inject({
      method: "POST",
      url: "/v1/bank-sms/captures",
      headers: {
        "content-type": "application/json",
        authorization: [`Bearer ${token}`, `Bearer ${token}`]
      } as unknown as Record<string, string>,
      payload: JSON.stringify(payload)
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it.each([
    new BankSmsAuthenticationError(),
    new BankSmsValidationError(),
    new BankSmsConfigurationError()
  ])("sanitizes typed application errors and does not expose credential details", async (error) => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => { calls.push(input); throw error; };
    const app = buildApp({ logger: false, processBankSmsCapture: useCase });

    const response = await request(app);

    const expected = error instanceof BankSmsAuthenticationError ? [401, "No autorizado."]
      : error instanceof BankSmsValidationError ? [422, "La captura bancaria no coincide con la configuración."]
      : [503, "La captura bancaria no está disponible."];
    expect(response.statusCode).toBe(expected[0]);
    expect(response.json()).toEqual({ status: "rejected", message: expected[1] });
    expect(response.body).not.toContain(token);
    expect(calls).toHaveLength(1);
    await app.close();
  });

  it("rejects invalid or unknown request fields before mutation", async () => {
    const { calls, useCase } = createUseCase();
    const app = buildApp({ logger: false, processBankSmsCapture: useCase });

    const response = await request(app, `Bearer ${token}`, { ...payload, unexpected: true });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ status: "rejected", message: "La captura bancaria no es válida." });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it("sanitizes unexpected failures", async () => {
    const secret = "database failure containing token";
    const { useCase } = createUseCase();
    useCase.execute = async () => { throw new Error(secret); };
    const app = buildApp({ logger: false, processBankSmsCapture: useCase, genReqId: () => "bank-sms-500" });

    const response = await request(app);

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500, error: "Internal Server Error", message: "Ocurrió un error interno. Intentá nuevamente.", errorId: "bank-sms-500"
    });
    expect(response.body).not.toContain(secret);
    await app.close();
  });
});
