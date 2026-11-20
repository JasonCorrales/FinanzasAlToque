import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleBankEmailCaptureAuditRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-capture-audit-repository.js";
import { DrizzleBankEmailCredentialRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-credential-repository.js";
import { DrizzleBankEmailTemplateRepository } from "../../src/infrastructure/repositories/drizzle-bank-email-template-repository.js";
import { DrizzleCaptureRepository } from "../../src/infrastructure/repositories/drizzle-capture-repository.js";
import { DrizzlePaymentMethodCatalogRepository } from "../../src/infrastructure/repositories/drizzle-payment-method-catalog-repository.js";
import { DrizzleTransactionRepository } from "../../src/infrastructure/repositories/drizzle-transaction-repository.js";

import {
  ProcessBankEmailCapture,
  type ProcessBankEmailCaptureInput
} from "../../src/application/process-bank-email-capture.js";
import type {
  BankEmailAdapterCredentialRecord,
  BankEmailCaptureAuditRecord,
  BankEmailCaptureAuditRepository,
  BankEmailCredentialRepository,
  BankEmailTemplateRecord,
  BankEmailTemplateRepository,
  CaptureRecord,
  CaptureRepository,
  PaymentMethodCatalogRepository,
  PaymentMethodRecord,
  TransactionRecord,
  TransactionRepository
} from "../../src/application/ports.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "10000000-0000-4000-8000-000000000002";
const rawToken = "bank-email-token-which-is-long-enough-123456";
const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
const sender = "NotificacionBAC@baccredomatic.cr";
const subject = "Notificación de transacción APPLE.COM/BILL 17-11-2026 - 18:07";
const customer = "Cliente Sintético";
const body = [
  `Estimado(a) ${customer},`,
  "",
  "Le informamos que se realizó una transacción con su tarjeta.",
  "",
  "Comercio: APPLE.COM/BILL",
  "Ciudad y país: CUPERTINO, ESTADOS UNIDOS",
  "Fecha: Nov 17, 2026, 18:07",
  "VISA: 4242",
  "Autorización: AUTH-SYNTH-0001",
  "Referencia: REF-SYNTH-0001",
  "Tipo de Transacción: COMPRA",
  "Monto: USD 2.99"
].join("\n");

class Store implements CaptureRepository, TransactionRepository, PaymentMethodCatalogRepository, BankEmailCredentialRepository, BankEmailTemplateRepository, BankEmailCaptureAuditRepository {
  captures = new Map<string, CaptureRecord>();
  transactions = new Map<string, TransactionRecord>();
  emailAudits = new Map<string, BankEmailCaptureAuditRecord>();
  emailCredentials = new Map<string, BankEmailAdapterCredentialRecord>();
  emailTemplates = new Map<string, BankEmailTemplateRecord>();
  paymentMethods = new Map<string, PaymentMethodRecord>();
  emailTouches = 0;
  lookedUpHashes: string[] = [];

  async createOrGet(input: CaptureRecord) {
    const key = `${input.workspaceId}:${input.channel}:${input.externalMessageId}`;
    const existing = this.captures.get(key);
    if (existing) return existing;
    this.captures.set(key, input);
    return input;
  }
  async findByCaptureId(workspace: string, captureId: string) {
    return this.transactions.get(`${workspace}:${captureId}`) ?? null;
  }
  async saveOrGet(input: TransactionRecord) {
    const key = `${input.workspaceId}:${input.captureId}`;
    const existing = this.transactions.get(key);
    if (existing) return { transaction: existing, created: false };
    this.transactions.set(key, input);
    return { transaction: input, created: true };
  }
  async findEnabled(workspace: string, code: string) {
    const method = this.paymentMethods.get(`${workspace}:${code}`);
    return method?.enabled ? method : null;
  }
  async create(): Promise<BankEmailAdapterCredentialRecord> { throw new Error("not used"); }
  async listByWorkspace(): Promise<never[]> { return []; }
  async findActiveByTokenHash(hash: string) {
    this.lookedUpHashes.push(hash);
    return this.emailCredentials.get(hash) ?? null;
  }
  async touchLastUsed(workspace: string, id: string) {
    const credential = [...this.emailCredentials.values()].find((item) => item.workspaceId === workspace && item.id === id);
    if (!credential) return null;
    this.emailTouches += 1;
    return { ...credential, lastUsedAt: new Date() };
  }
  async revoke(): Promise<null> { return null; }
  async rotate(): Promise<null> { return null; }
  async assign(): Promise<never> { throw new Error("not used"); }
  async resolveActive(workspace: string, source?: string) {
    const template = this.emailTemplates.get(workspace) ?? null;
    return template?.source === source ? template : null;
  }
  async saveOrGetAudit(input: BankEmailCaptureAuditRecord) {
    const existing = this.emailAudits.get(input.captureId);
    if (existing) return { audit: existing, created: false };
    this.emailAudits.set(input.captureId, input);
    return { audit: input, created: true };
  }
}

function setup() {
  const store = new Store();
  store.emailCredentials.set(tokenHash, {
    id: "20000000-0000-4000-8000-000000000001", workspaceId, adapter: "gmail-apps-script", active: true,
    createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null
  });
  store.emailTemplates.set(workspaceId, {
    id: "30000000-0000-4000-8000-000000000001", workspaceId, source: "bac_purchase", version: "bac-email-v1",
    paymentMethod: "bac-visa", institution: "BAC", cardBrand: "VISA", cardLastFour: "4242", active: true, createdAt: new Date(), updatedAt: new Date()
  });
  store.paymentMethods.set(`${workspaceId}:bac-visa`, { workspaceId, code: "bac-visa", label: "BAC VISA", enabled: true });
  let sequence = 0;
  return {
    store,
    useCase: new ProcessBankEmailCapture({
      captures: store, transactions: store, paymentMethods: store, credentials: store, templates: store, audits: store,
      nextId: () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    })
  };
}

const input: ProcessBankEmailCaptureInput = {
  token: rawToken, eventId: "email-event-42", sender, subject, body,
  receivedAt: new Date("2026-03-01T12:00:00.000Z"),
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass", domain: "baccredomatic.cr" }
};

function expectUnchanged(store: Store) {
  expect(store.captures).toHaveLength(0);
  expect(store.transactions).toHaveLength(0);
  expect(store.emailAudits).toHaveLength(0);
  expect(store.emailTouches).toBe(0);
}

describe("ProcessBankEmailCapture", () => {
  it("hashes the raw Bearer token and directly registers the BAC expense with only privacy-safe persisted data", async () => {
    const { store, useCase } = setup();
    const result = await useCase.execute(input);

    expect(result).toEqual({
      status: "registered", transactionId: "40000000-0000-4000-8000-000000000002", duplicate: false,
      transaction: { transactionType: "expense", amount: "2.99", currency: "USD", concept: "APPLE.COM/BILL", paymentMethod: "bac-visa", status: "registered", confidence: 1 }
    });
    expect(store.lookedUpHashes).toEqual([tokenHash]);
    expect([...store.captures.values()][0]).toMatchObject({ channel: "bank_email", rawMessage: "bank_email:bac_purchase:result=accepted" });
    expect([...store.emailAudits.values()][0]).toMatchObject({ templateId: "30000000-0000-4000-8000-000000000001", templateVersion: "bac-email-v1", authenticationResult: "passed", messageHash: expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/) });
    const persisted = JSON.stringify({ captures: [...store.captures.values()], audits: [...store.emailAudits.values()] });
    for (const sensitive of [rawToken, body, customer, "4242", "AUTH-SYNTH-0001", "REF-SYNTH-0001", "CUPERTINO, ESTADOS UNIDOS"]) expect(persisted).not.toContain(sensitive);
    expect(store.emailTouches).toBe(1);
  });

  it("returns the exact existing outcome for a duplicate without another capture, audit, transaction, or credential touch", async () => {
    const { store, useCase } = setup();
    const first = await useCase.execute(input);
    await expect(useCase.execute(input)).resolves.toEqual({ ...first, duplicate: true });
    expect(store.captures).toHaveLength(1);
    expect(store.transactions).toHaveLength(1);
    expect(store.emailAudits).toHaveLength(1);
    expect(store.emailTouches).toBe(1);
  });

  it("fails closed for every missing or non-passing authentication evidence category", async () => {
    for (const authentication of [
      undefined,
      { ...input.authentication, spf: "fail" },
      { ...input.authentication, dkim: "fail" },
      { ...input.authentication, dmarc: "fail" },
      { ...input.authentication, domain: "evil.example" }
    ]) {
      const { store, useCase } = setup();
      await expect(useCase.execute({ ...input, authentication } as never)).rejects.toThrow("bank email authentication failed");
      expectUnchanged(store);
    }
  });

  it("rejects a parsed card identity that differs from the active template without side effects", async () => {
    const { store, useCase } = setup();

    await expect(useCase.execute({ ...input, body: body.replace("VISA: 4242", "VISA: 9999") })).rejects.toThrow(
      "bank email capture does not match the configured template"
    );
    expectUnchanged(store);
  });

  it("fails closed when the active template has legacy null card identity", async () => {
    const { store, useCase } = setup();
    Object.assign(store.emailTemplates.get(workspaceId)!, {
      institution: null,
      cardBrand: null,
      cardLastFour: null
    });

    await expect(useCase.execute(input)).rejects.toThrow("BAC purchase email template is unavailable");
    expectUnchanged(store);
  });

  it("cannot use a matching card identity configured for another workspace", async () => {
    const { store, useCase } = setup();
    const template = store.emailTemplates.get(workspaceId)!;
    store.emailTemplates.set(workspaceId, { ...template, cardLastFour: "9999" });
    store.emailTemplates.set(otherWorkspaceId, { ...template, workspaceId: otherWorkspaceId, cardLastFour: "4242" });

    await expect(useCase.execute(input)).rejects.toThrow("bank email capture does not match the configured template");
    expectUnchanged(store);
  });

  it("fails closed for malformed or unknown credentials, malformed timestamps, parser mismatches, disabled payment methods, and foreign workspace configuration", async () => {
    const scenarios: Array<(store: Store) => ProcessBankEmailCaptureInput> = [
      () => ({ ...input, token: "" }),
      () => ({ ...input, token: "unknown-bank-email-token-which-is-long-enough" }),
      (store) => { store.emailCredentials.get(tokenHash)!.active = false; return input; },
      () => ({ ...input, eventId: "   " }),
      () => ({ ...input, receivedAt: new Date("invalid") }),
      () => ({ ...input, body: body.replace("APPLE.COM/BILL", "OTHER SHOP") }),
      (store) => { store.emailTemplates.clear(); return input; },
      (store) => { store.emailTemplates.get(workspaceId)!.active = false; return input; },
      (store) => { store.paymentMethods.get(`${workspaceId}:bac-visa`)!.enabled = false; return input; },
      (store) => { store.emailTemplates.set(workspaceId, { ...store.emailTemplates.get(workspaceId)!, workspaceId: otherWorkspaceId }); return input; }
    ];
    for (const arrange of scenarios) {
      const { store, useCase } = setup();
      await expect(useCase.execute(arrange(store))).rejects.toThrow();
      expectUnchanged(store);
    }
  });

  it("persists the fixed accepted capture text and audit metadata through committed PGlite migrations without duplicate records", async () => {
    const client = new PGlite();
    const db: PgliteDatabase<typeof schema> = drizzle(client, { schema });
    try {
      await applyMigrations(client);
      await db.insert(schema.paymentMethods).values({ workspaceId, code: "bac-visa", label: "BAC VISA", enabled: true });
      const credentials = new DrizzleBankEmailCredentialRepository(db);
      const templates = new DrizzleBankEmailTemplateRepository(db);
      await credentials.create({ workspaceId, adapter: "gmail-apps-script", tokenHash });
      await templates.assign({
        workspaceId, source: "bac_purchase", version: "bac-email-v1", paymentMethod: "bac-visa",
        institution: "BAC", cardBrand: "VISA", cardLastFour: "4242"
      });

      let sequence = 0;
      const useCase = new ProcessBankEmailCapture({
        captures: new DrizzleCaptureRepository(db),
        transactions: new DrizzleTransactionRepository(db),
        paymentMethods: new DrizzlePaymentMethodCatalogRepository(db),
        credentials,
        templates,
        audits: new DrizzleBankEmailCaptureAuditRepository(db),
        nextId: () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
      });

      await expect(useCase.execute(input)).resolves.toMatchObject({ status: "registered", duplicate: false });
      await expect(useCase.execute(input)).resolves.toMatchObject({ status: "registered", duplicate: true });

      const captures = await db.select().from(schema.captures);
      const audits = await db.select().from(schema.bankEmailCaptureAudits);
      const transactions = await db.select().from(schema.transactions);
      expect(captures).toHaveLength(1);
      expect(audits).toHaveLength(1);
      expect(transactions).toHaveLength(1);
      expect(captures[0]).toMatchObject({ channel: "bank_email", rawMessage: "bank_email:bac_purchase:result=accepted" });
      expect(audits[0]).toMatchObject({ authenticationResult: "passed", redactedMetadata: expect.stringContaining("template=") });
    } finally {
      await client.close();
    }
  });
});
