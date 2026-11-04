import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleCaptureRepository } from "../../src/infrastructure/repositories/drizzle-capture-repository.js";
import { DrizzleConfirmationPolicyRepository } from "../../src/infrastructure/repositories/drizzle-confirmation-policy-repository.js";
import { DrizzlePaymentMethodCatalogRepository } from "../../src/infrastructure/repositories/drizzle-payment-method-catalog-repository.js";
import { DrizzleTransactionRepository } from "../../src/infrastructure/repositories/drizzle-transaction-repository.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";

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

describe("PostgreSQL repositories", () => {
  it("applies the same versioned migration more than once without changing existing state", async () => {
    const captures = new DrizzleCaptureRepository(db);
    await captures.createOrGet({
      id: "20000000-0000-4000-8000-000000000010",
      workspaceId,
      externalMessageId: "telegram-migration-check",
      channel: "telegram",
      rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
      status: "received"
    });

    await applyMigrations(client);

    expect(await captures.count()).toBe(1);
  });

  it("stores an incoming capture idempotently by workspace, channel, and external message", async () => {
    const repository = new DrizzleCaptureRepository(db);
    const input = {
      id: "20000000-0000-4000-8000-000000000001",
      workspaceId,
      externalMessageId: "telegram-42",
      channel: "telegram" as const,
      rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
      status: "received" as const
    };

    const first = await repository.createOrGet(input);
    const repeated = await repository.createOrGet({
      ...input,
      id: "20000000-0000-4000-8000-000000000002"
    });

    expect(repeated.id).toBe(first.id);
    expect(await repository.count()).toBe(1);
  });

  it("resolves only enabled workspace catalog methods by normalized code or label", async () => {
    const repository = new DrizzlePaymentMethodCatalogRepository(db);

    expect(await repository.findEnabled(workspaceId, "Tarjeta")).toBeNull();

    await db.insert(schema.paymentMethods).values([
      { workspaceId, code: "card", label: "Tarjeta", enabled: true },
      { workspaceId, code: "sinpe", label: "Sinpe Móvil", enabled: true },
      { workspaceId, code: "cash", label: "Efectivo", enabled: false },
      {
        workspaceId: "10000000-0000-4000-8000-000000000099",
        code: "foreign-card",
        label: "Tarjeta extranjera",
        enabled: true
      }
    ]);

    await expect(repository.findEnabled(workspaceId, " CARD ")).resolves.toMatchObject({
      code: "card",
      label: "Tarjeta"
    });
    await expect(repository.findEnabled(workspaceId, "sinpe movil")).resolves.toMatchObject({
      code: "sinpe",
      label: "Sinpe Móvil"
    });
    await expect(repository.findEnabled(workspaceId, "Efectivo")).resolves.toBeNull();
    await expect(repository.findEnabled(workspaceId, "Tarjeta extranjera")).resolves.toBeNull();
  });

  it("fails closed when normalized code or label matches more than one enabled catalog method", async () => {
    const repository = new DrizzlePaymentMethodCatalogRepository(db);

    await db.insert(schema.paymentMethods).values([
      { workspaceId, code: "card", label: "Tarjeta", enabled: true },
      { workspaceId, code: "tarjeta", label: "Crédito", enabled: true }
    ]);

    await expect(repository.findEnabled(workspaceId, "Tarjeta")).resolves.toBeNull();
  });

  it("upserts one confirmation policy per workspace and channel", async () => {
    const repository = new DrizzleConfirmationPolicyRepository(db);

    const created = await repository.save({
      id: "30000000-0000-4000-8000-000000000001",
      workspaceId,
      channel: "telegram",
      mode: "confidence_based",
      confidenceThreshold: "0.8000"
    });
    const updated = await repository.save({
      id: "30000000-0000-4000-8000-000000000002",
      workspaceId,
      channel: "telegram",
      mode: "always_confirm",
      confidenceThreshold: null
    });

    expect(created.version).toBe(1);
    expect(updated).toMatchObject({ mode: "always_confirm", version: 2 });
    expect(await repository.findByWorkspaceAndChannel(workspaceId, "telegram")).toMatchObject({
      id: created.id,
      mode: "always_confirm",
      confidenceThreshold: null,
      version: 2
    });
  });

  it("stores one valid transaction per capture and leaves it unchanged when a duplicate is rejected", async () => {
    const captures = new DrizzleCaptureRepository(db);
    const transactions = new DrizzleTransactionRepository(db);
    const capture = await captures.createOrGet({
      id: "20000000-0000-4000-8000-000000000003",
      workspaceId,
      externalMessageId: "telegram-43",
      channel: "telegram",
      rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
      status: "processed"
    });
    const transaction = {
      id: "40000000-0000-4000-8000-000000000001",
      workspaceId,
      captureId: capture.id,
      transactionType: "expense" as const,
      amount: "15000",
      currency: "CRC",
      concept: "Gasolina",
      paymentMethod: "card",
      status: "registered" as const,
      confidence: "0.9800"
    };

    const first = await transactions.saveOrGet(transaction);
    const repeated = await transactions.saveOrGet({
      ...transaction,
      id: "40000000-0000-4000-8000-000000000002"
    });

    expect(first.created).toBe(true);
    expect(repeated).toMatchObject({ created: false, transaction: { id: transaction.id } });
    expect(await transactions.count()).toBe(1);
    expect(await transactions.findByCaptureId(workspaceId, capture.id)).toMatchObject({
      ...transaction,
      amount: "15000.000000"
    });
  });

  it("rejects a transaction that points to another workspace's capture", async () => {
    const captures = new DrizzleCaptureRepository(db);
    const transactions = new DrizzleTransactionRepository(db);
    const foreignCapture = await captures.createOrGet({
      id: "20000000-0000-4000-8000-000000000020",
      workspaceId,
      externalMessageId: "telegram-foreign",
      channel: "telegram",
      rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
      status: "processed"
    });

    await expect(
      transactions.saveOrGet({
        id: "40000000-0000-4000-8000-000000000020",
        workspaceId: "10000000-0000-4000-8000-000000000099",
        captureId: foreignCapture.id,
        transactionType: "expense",
        amount: "15000",
        currency: "CRC",
        concept: "Gasolina",
        paymentMethod: "card",
        status: "registered",
        confidence: "0.9800"
      })
    ).rejects.toThrow();

    expect(await transactions.count()).toBe(0);
    expect(
      await transactions.findByCaptureId(
        "10000000-0000-4000-8000-000000000099",
        foreignCapture.id
      )
    ).toBeNull();
  });

  it.each([
    ["amount", { amount: "0" }],
    ["currency", { currency: "colones" }],
    ["concept", { concept: " " }],
    ["payment method", { paymentMethod: "" }],
    ["confidence", { confidence: "1.1000" }]
  ])("rejects invalid %s and leaves transaction storage unchanged", async (_field, invalid) => {
    const captures = new DrizzleCaptureRepository(db);
    const transactions = new DrizzleTransactionRepository(db);
    const capture = await captures.createOrGet({
      id: crypto.randomUUID(),
      workspaceId,
      externalMessageId: crypto.randomUUID(),
      channel: "telegram",
      rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
      status: "processed"
    });

    await expect(
      transactions.saveOrGet({
        id: crypto.randomUUID(),
        workspaceId,
        captureId: capture.id,
        transactionType: "expense",
        amount: "15000",
        currency: "CRC",
        concept: "Gasolina",
        paymentMethod: "card",
        status: "registered",
        confidence: "0.9800",
        ...invalid
      })
    ).rejects.toThrow();

    expect(await transactions.count()).toBe(0);
  });
});
