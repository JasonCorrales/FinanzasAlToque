import { createHash } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { buildProductionApp } from "../../src/bootstrap.js";
import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";

const clients: PGlite[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("production application composition", () => {
  it("exposes the capture endpoint with real repositories", async () => {
    const client = new PGlite();
    clients.push(client);
    await applyMigrations(client);
    const db = drizzle(client, { schema });
    await db.insert(schema.paymentMethods).values({
      workspaceId: "10000000-0000-4000-8000-000000000001",
      code: "card",
      label: "Tarjeta",
      enabled: true
    });
    let sequence = 0;
    const app = buildProductionApp(db, {
      logger: false,
      nextId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: {
        workspaceId: "10000000-0000-4000-8000-000000000001",
        externalMessageId: "telegram-production-1",
        channel: "telegram",
        message: "Gaste 15.000 colones en Gasolina pague con Tarjeta"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "pending_confirmation" });

    const decision = await app.inject({
      method: "POST",
      url: `/v1/transactions/${response.json().transactionId}/decision`,
      payload: {
        workspaceId: "10000000-0000-4000-8000-000000000001",
        action: "confirm"
      }
    });

    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toEqual({
      status: "registered",
      message: "Gasto confirmado: ₡15.000 CRC en Gasolina."
    });
    await app.close();
  });

  it("composes the bank SMS endpoint with the production credential, template, audit, capture, payment, and transaction repositories", async () => {
    const client = new PGlite();
    clients.push(client);
    await applyMigrations(client);
    const db = drizzle(client, { schema });
    const workspaceId = "10000000-0000-4000-8000-000000000001";
    const token = "bank-sms-token-which-is-long-enough-123456";
    await db.insert(schema.paymentMethods).values({ workspaceId, code: "card", label: "Tarjeta", enabled: true });
    await db.insert(schema.bankSmsDeviceCredentials).values({
      workspaceId, deviceLabel: "iPhone", tokenHash: createHash("sha256").update(token, "utf8").digest("hex")
    });
    await db.insert(schema.bankSmsTemplates).values({
      workspaceId, sender: "+50662229581", version: "coope-ande-v1", paymentMethod: "card",
      body: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones"
    });
    let sequence = 0;
    const app = buildProductionApp(db, {
      logger: false,
      nextId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    });

    const response = await app.inject({
      method: "POST", url: "/v1/bank-sms/captures", headers: { authorization: `Bearer ${token}` },
      payload: {
        eventId: "bank-production-1", sender: "+506 6222-9581",
        message: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Super Mercado por 5,300.00 colones",
        receivedAt: "2026-03-01T12:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      status: "registered", duplicate: false, transactionId: "00000000-0000-4000-8000-000000000002",
      transaction: { amount: "5300.000000", currency: "CRC", concept: "Super Mercado", paymentMethod: "card" }
    });
    expect((await db.select().from(schema.bankSmsCaptureAudits))).toHaveLength(1);
    await app.close();
  });

  it("rejects captures until the workspace catalog is manually provisioned", async () => {
    const client = new PGlite();
    clients.push(client);
    await applyMigrations(client);
    const db = drizzle(client, { schema });
    const app = buildProductionApp(db, { logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: {
        workspaceId: "10000000-0000-4000-8000-000000000001",
        externalMessageId: "telegram-production-catalog-empty",
        channel: "telegram",
        message: "Gaste 15.000 colones en Gasolina pague con Tarjeta"
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      status: "needs_information",
      missingFields: ["paymentMethod"]
    });
    await app.close();
  });
});
