import { createHash } from "node:crypto";
import { Writable } from "node:stream";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import {
  BankEmailAuthenticationError,
  BankEmailConfigurationError,
  BankEmailValidationError,
  type ProcessBankEmailCapture
} from "../../src/application/process-bank-email-capture.js";
import type { ProcessBankSmsCapture } from "../../src/application/process-bank-sms-capture.js";
import { buildProductionApp } from "../../src/bootstrap.js";
import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { buildApp } from "../../src/http-app.js";

const token = "bank-email-token-which-is-long-enough-123456";
const sender = "NotificacionBAC@baccredomatic.cr";
const subject = "Notificación de transacción APPLE.COM/BILL 17-11-2026 - 18:07";
const body = "Comercio: APPLE.COM/BILL\nVISA: 4242\nAutorización: AUTH-SYNTH-0001\nReferencia: REF-SYNTH-0001";
const payload = {
  eventId: "email-event-42",
  sender,
  subject,
  body,
  receivedAt: "2026-03-01T12:00:00.000Z",
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass", domain: "baccredomatic.cr" }
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
          amount: "2.99",
          currency: "USD",
          concept: "APPLE.COM/BILL",
          paymentMethod: "bac-visa",
          status: "registered" as const,
          confidence: 1
        }
      };
    }
  } as ProcessBankEmailCapture;
  return { calls, useCase };
}

function appFor(useCase: ProcessBankEmailCapture) {
  return buildApp({ logger: false, processBankEmailCapture: useCase } as never);
}

function request(app: ReturnType<typeof buildApp>, authorization = `Bearer ${token}`, requestBody: unknown = payload) {
  return app.inject({
    method: "POST",
    url: "/v1/bank-email/captures",
    headers: { "content-type": "application/json", ...(authorization === "" ? {} : { authorization }) },
    payload: JSON.stringify(requestBody)
  });
}

const publicOutcome = {
  status: "registered",
  duplicate: false,
  transactionId: "40000000-0000-4000-8000-000000000001",
  transaction: { amount: "2.99", currency: "USD", concept: "APPLE.COM/BILL", paymentMethod: "bac-visa" }
};

function expectSanitized(response: { body: string }) {
  for (const sensitive of [token, sender, subject, body, "4242", "AUTH-SYNTH-0001", "REF-SYNTH-0001"]) {
    expect(response.body).not.toContain(sensitive);
  }
}

describe("POST /v1/bank-email/captures", () => {
  it("registers an authenticated BAC email with the exact public transaction contract", async () => {
    const { calls, useCase } = createUseCase();
    const app = appFor(useCase);

    const response = await request(app);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(publicOutcome);
    expect(calls).toEqual([{
      token,
      eventId: payload.eventId,
      sender,
      subject,
      body,
      receivedAt: new Date(payload.receivedAt),
      authentication: payload.authentication
    }]);
    expectSanitized(response);
    await app.close();
  });

  it("returns the exact registered contract with 200 for an idempotent duplicate", async () => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => {
      calls.push(input);
      return { ...await createUseCase().useCase.execute(input), duplicate: true };
    };
    const app = appFor(useCase);

    const response = await request(app, `Bearer ${token}`, { ...payload, eventId: "email-event-43" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...publicOutcome, duplicate: true });
    expect(calls).toHaveLength(1);
    expectSanitized(response);
    await app.close();
  });

  it.each(["", "Basic credential", "Bearer", "Bearer x", "Bearer one two"])(
    "rejects missing or malformed Bearer credentials without side effects: %s",
    async (authorization) => {
      const { calls, useCase } = createUseCase();
      const app = appFor(useCase);

      const response = await request(app, authorization);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
      expect(calls).toHaveLength(0);
      expectSanitized(response);
      await app.close();
    }
  );

  it.each([
    new BankEmailAuthenticationError(),
    new BankEmailValidationError("parser mismatch containing APPLE.COM/BILL"),
    new BankEmailConfigurationError("template unavailable containing AUTH-SYNTH-0001")
  ])("sanitizes unknown/revoked credentials, parser mismatch, and configuration failures", async (error) => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => { calls.push(input); throw error; };
    const app = appFor(useCase);

    const response = await request(app);

    const expected = error instanceof BankEmailAuthenticationError ? [401, "No autorizado."]
      : error instanceof BankEmailValidationError ? [422, "La captura bancaria no coincide con la configuración."]
      : [503, "La captura bancaria no está disponible."];
    expect(response.statusCode).toBe(expected[0]);
    expect(response.json()).toEqual({ status: "rejected", message: expected[1] });
    expect(calls).toHaveLength(1);
    expectSanitized(response);
    await app.close();
  });

  it.each([
    { ...payload, eventId: "" },
    { ...payload, receivedAt: "not-a-timestamp" },
    { ...payload, authentication: { ...payload.authentication, spf: "failed" } },
    { ...payload, unexpected: true },
    { ...payload, body: "" }
  ])("rejects malformed event IDs, timestamps, authentication evidence, and bodies before side effects", async (invalidPayload) => {
    const { calls, useCase } = createUseCase();
    const app = appFor(useCase);

    const response = await request(app, `Bearer ${token}`, invalidPayload);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ status: "rejected", message: "La captura bancaria no es válida." });
    expect(calls).toHaveLength(0);
    expectSanitized(response);
    await app.close();
  });

  it.each([
    { eventId: "x".repeat(513) },
    { sender: "x".repeat(321) },
    { subject: "x".repeat(999) },
    { body: "x".repeat(65_537) },
    { authentication: { ...payload.authentication, domain: "x".repeat(254) } }
  ])("rejects oversized email inputs before side effects", async (oversized) => {
    const { calls, useCase } = createUseCase();
    const app = appFor(useCase);

    const response = await request(app, `Bearer ${token}`, { ...payload, ...oversized });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ status: "rejected", message: "La captura bancaria no es válida." });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it.each(["fail", "softfail", "neutral", "none", "temperror", "permerror"])("normalizes recognized non-passing authentication result %s before authentication", async (result) => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => { calls.push(input); throw new BankEmailAuthenticationError(); };
    const app = appFor(useCase);

    const response = await request(app, `Bearer ${token}`, {
      ...payload,
      authentication: { spf: result, dkim: result, dmarc: result, domain: "baccredomatic.cr" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
    expect(calls).toEqual([expect.objectContaining({
      authentication: { spf: result === "pass" ? "pass" : "fail", dkim: result === "pass" ? "pass" : "fail", dmarc: result === "pass" ? "pass" : "fail", domain: "baccredomatic.cr" }
    })]);
    await app.close();
  });

  it.each(["spf", "dkim", "dmarc"] as const)("maps failed %s evidence to sanitized authentication rejection", async (field) => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => { calls.push(input); throw new BankEmailAuthenticationError(); };
    const app = appFor(useCase);

    const response = await request(app, `Bearer ${token}`, {
      ...payload,
      authentication: { ...payload.authentication, [field]: "fail" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
    expect(calls).toHaveLength(1);
    expectSanitized(response);
    await app.close();
  });

  it("does not log unexpected email-capture error details", async () => {
    const secret = `unexpected email failure ${sender} ${body}`;
    const logChunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      }
    });
    const { useCase } = createUseCase();
    useCase.execute = async () => { throw new Error(secret); };
    const app = buildApp({
      logger: { level: "error", stream },
      genReqId: () => "bank-email-500",
      processBankEmailCapture: useCase
    });

    const response = await request(app);

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500, error: "Internal Server Error", message: "Ocurrió un error interno. Intentá nuevamente.", errorId: "bank-email-500"
    });
    expect(response.body).not.toContain(secret);
    expect(logChunks.join("\n")).not.toContain(secret);
    expect(logChunks.join("\n")).not.toContain(sender);
    await app.close();
  });

  it("composes the production email repositories and use case", async () => {
    const client = new PGlite();
    const workspaceId = "10000000-0000-4000-8000-000000000001";
    await applyMigrations(client);
    const db = drizzle(client, { schema });
    await db.insert(schema.paymentMethods).values({ workspaceId, code: "bac-visa", label: "BAC VISA", enabled: true });
    await db.insert(schema.bankEmailAdapterCredentials).values({
      workspaceId,
      adapter: "gmail-apps-script",
      tokenHash: createHash("sha256").update(token, "utf8").digest("hex")
    });
    await db.insert(schema.bankEmailTemplates).values({
      workspaceId, source: "bac_purchase", version: "bac-email-v1", paymentMethod: "bac-visa"
    });
    let sequence = 0;
    const app = buildProductionApp(db, {
      logger: false,
      environment: { SUPABASE_URL: "https://project.supabase.co" },
      nextId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    });

    try {
      const response = await request(app, `Bearer ${token}`, {
        ...payload,
        body: [
          "Estimado(a) Cliente Sintético,", "", "Le informamos que se realizó una transacción con su tarjeta.", "", "Comercio: APPLE.COM/BILL", "Ciudad y país: CUPERTINO, ESTADOS UNIDOS",
          "Fecha: Nov 17, 2026, 18:07", "VISA: 4242", "Autorización: AUTH-SYNTH-0001", "Referencia: REF-SYNTH-0001",
          "Tipo de Transacción: COMPRA", "Monto: USD 2.99"
        ].join("\n")
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        status: "registered", duplicate: false, transactionId: "00000000-0000-4000-8000-000000000002",
        transaction: { amount: "2.99", currency: "USD", concept: "APPLE.COM/BILL", paymentMethod: "bac-visa" }
      });
      expect((await db.select().from(schema.bankEmailCaptureAudits))).toHaveLength(1);
      await app.close();
    } finally {
      await client.close();
    }
  }, 15_000);

  it("maps an untrusted authentication domain to sanitized authentication rejection", async () => {
    const { calls, useCase } = createUseCase();
    useCase.execute = async (input) => { calls.push(input); throw new BankEmailAuthenticationError(); };
    const app = appFor(useCase);

    const response = await request(app, `Bearer ${token}`, {
      ...payload,
      authentication: { ...payload.authentication, domain: "evil.example" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
    expect(calls).toHaveLength(1);
    expectSanitized(response);
    await app.close();
  });

  it("preserves the bank-SMS public endpoint contract", async () => {
    const smsUseCase = {
      async execute() {
        return {
          status: "registered" as const, duplicate: false, transactionId: "40000000-0000-4000-8000-000000000002",
          transaction: { transactionType: "expense" as const, amount: "5300.00", currency: "CRC", concept: "Super Mercado", paymentMethod: "card", status: "registered" as const, confidence: 1 }
        };
      }
    } as unknown as ProcessBankSmsCapture;
    const app = buildApp({ logger: false, processBankSmsCapture: smsUseCase });

    const response = await app.inject({
      method: "POST", url: "/v1/bank-sms/captures", headers: { authorization: "bEaReR bank-sms-token-which-is-long-enough-123456" },
      payload: { eventId: "bank-regression-1", sender: "+506 6222-9581", message: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Super Mercado por 5,300.00 colones" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      status: "registered", duplicate: false, transactionId: "40000000-0000-4000-8000-000000000002",
      transaction: { amount: "5300.00", currency: "CRC", concept: "Super Mercado", paymentMethod: "card" }
    });
    await app.close();
  });
});
