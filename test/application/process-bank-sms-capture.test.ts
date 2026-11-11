import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ProcessBankSmsCapture } from "../../src/application/process-bank-sms-capture.js";
import { ProcessCapture } from "../../src/application/process-capture.js";
import { SpanishExpenseInterpreter } from "../../src/infrastructure/interpreters/spanish-expense-interpreter.js";
import type {
  BankSmsCaptureAuditRecord,
  BankSmsCaptureAuditRepository,
  BankSmsCredentialRepository,
  BankSmsDeviceCredentialRecord,
  BankSmsTemplateRecord,
  BankSmsTemplateRepository,
  CaptureRecord,
  CaptureRepository,
  PaymentMethodCatalogRepository,
  PaymentMethodRecord,
  TransactionRecord,
  TransactionRepository
} from "../../src/application/ports.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "10000000-0000-4000-8000-000000000002";
const rawToken = "bank-sms-token-which-is-long-enough-123456";
const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
const body = "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones";
const message = "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Super Mercado por 5,300.00 colones";

class Store implements CaptureRepository, TransactionRepository, PaymentMethodCatalogRepository, BankSmsCredentialRepository, BankSmsTemplateRepository, BankSmsCaptureAuditRepository {
  captures = new Map<string, CaptureRecord>();
  transactions = new Map<string, TransactionRecord>();
  audits = new Map<string, BankSmsCaptureAuditRecord>();
  credentials = new Map<string, BankSmsDeviceCredentialRecord>();
  templates = new Map<string, BankSmsTemplateRecord>();
  paymentMethods = new Map<string, PaymentMethodRecord>();
  touches = 0;
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
    const method = this.paymentMethods.get(`${workspace}:${code}`)
      ?? [...this.paymentMethods.values()].find((item) => item.workspaceId === workspace && item.label.toLowerCase() === code.toLowerCase());
    return method?.enabled ? method : null;
  }
  async create(): Promise<BankSmsDeviceCredentialRecord> { throw new Error("not used"); }
  async listByWorkspace(): Promise<never[]> { return []; }
  async findActiveByTokenHash(hash: string) {
    this.lookedUpHashes.push(hash);
    return this.credentials.get(hash) ?? null;
  }
  async touchLastUsed(workspace: string, id: string) {
    const credential = [...this.credentials.values()].find((item) => item.workspaceId === workspace && item.id === id);
    if (!credential) return null;
    this.touches += 1;
    return { ...credential, lastUsedAt: new Date() };
  }
  async revoke(): Promise<BankSmsDeviceCredentialRecord | null> { return null; }
  async rotate(): Promise<BankSmsDeviceCredentialRecord | null> { return null; }
  async assign(): Promise<BankSmsTemplateRecord> { throw new Error("not used"); }
  async resolveActive(workspace: string) { return this.templates.get(workspace) ?? null; }
  async saveOrGetAudit(input: BankSmsCaptureAuditRecord) {
    const existing = this.audits.get(input.captureId);
    if (existing) return { audit: existing, created: false };
    this.audits.set(input.captureId, input);
    return { audit: input, created: true };
  }
}

function setup() {
  const store = new Store();
  store.credentials.set(tokenHash, {
    id: "20000000-0000-4000-8000-000000000001", workspaceId, deviceLabel: "iPhone", active: true,
    createdAt: new Date(), updatedAt: new Date(), lastUsedAt: null, revokedAt: null
  });
  store.templates.set(workspaceId, {
    id: "30000000-0000-4000-8000-000000000001", workspaceId, sender: "+50662229581", body,
    version: "coope-ande-v1", paymentMethod: "card", active: true, createdAt: new Date(), updatedAt: new Date()
  });
  store.paymentMethods.set(`${workspaceId}:card`, { workspaceId, code: "card", label: "Tarjeta", enabled: true });
  let sequence = 0;
  return {
    store,
    useCase: new ProcessBankSmsCapture({
      captures: store, transactions: store, paymentMethods: store, credentials: store, templates: store, audits: store,
      nextId: () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    })
  };
}

const input = { token: rawToken, eventId: "event-42", sender: "+506 6222-9581", message, receivedAt: new Date("2026-03-01T12:00:00.000Z") };

describe("ProcessBankSmsCapture", () => {
  it("authenticates with a SHA-256 token hash and registers a CRC expense without persisting secrets or SMS text", async () => {
    const { store, useCase } = setup();
    const result = await useCase.execute(input);

    expect(result).toMatchObject({ status: "registered", duplicate: false, transaction: { amount: "5300", currency: "CRC", concept: "Super Mercado", paymentMethod: "card", status: "registered" } });
    expect(store.lookedUpHashes).toEqual([tokenHash]);
    expect(JSON.stringify([...store.captures.values()])).not.toContain(rawToken);
    expect(JSON.stringify([...store.captures.values()])).not.toContain(message);
    expect([...store.captures.values()][0]).toMatchObject({ channel: "bank_sms", rawMessage: "bank_sms:coope_ande_purchase:sender=+50662229581:merchant_length=13:amount_crc=5300" });
    expect([...store.audits.values()][0]).toMatchObject({ templateId: "30000000-0000-4000-8000-000000000001", templateVersion: "coope-ande-v1", credentialId: "20000000-0000-4000-8000-000000000001", messageHash: expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/) });
    expect(JSON.stringify([...store.audits.values()])).not.toContain(message);
    expect(store.touches).toBe(1);
  });

  it("rejects malformed, unknown, and revoked credentials with the same boundary error before state mutation", async () => {
    const { store, useCase } = setup();
    const unknown = "unknown-bank-sms-token-which-is-long-enough";
    await expect(useCase.execute({ ...input, token: "" })).rejects.toThrow("bank SMS authentication failed");
    await expect(useCase.execute({ ...input, token: unknown })).rejects.toThrow("bank SMS authentication failed");
    store.credentials.delete(tokenHash); // A revoked credential is not returned by the active-credential repository.
    await expect(useCase.execute(input)).rejects.toThrow("bank SMS authentication failed");
    expect(store.lookedUpHashes).toEqual([
      createHash("sha256").update(unknown, "utf8").digest("hex"),
      tokenHash
    ]);
    expect(store.captures).toHaveLength(0);
    expect(store.touches).toBe(0);
  });

  it("uses only the authenticated workspace template and enabled configured payment method", async () => {
    const { store, useCase } = setup();
    store.templates.set(otherWorkspaceId, { ...store.templates.get(workspaceId)!, workspaceId: otherWorkspaceId, paymentMethod: "foreign-card" });
    store.paymentMethods.clear();
    await expect(useCase.execute(input)).rejects.toThrow("bank SMS payment method is unavailable");
    expect(store.captures).toHaveLength(0);
    expect(store.touches).toBe(0);
  });

  it("rejects a message that does not fully match the configured template without state mutation", async () => {
    const { store, useCase } = setup();
    await expect(useCase.execute({ ...input, message: "Compra Super Mercado 5300" })).rejects.toThrow("message does not match the complete bank SMS template");
    expect(store.captures).toHaveLength(0);
    expect(store.transactions).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
    expect(store.touches).toBe(0);
  });

  it("returns the original outcome for duplicate events without new audit, transaction, or credential state", async () => {
    const { store, useCase } = setup();
    const first = await useCase.execute(input);
    const duplicate = await useCase.execute(input);
    expect(duplicate).toMatchObject({ status: "registered", duplicate: true, transactionId: first.transactionId });
    expect(store.captures).toHaveLength(1);
    expect(store.transactions).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
    expect(store.touches).toBe(1);
  });

  it("keeps concurrent duplicate delivery to one capture, audit, transaction, and credential touch", async () => {
    const { store, useCase } = setup();
    const outcomes = await Promise.all([useCase.execute(input), useCase.execute(input)]);
    expect(outcomes.map((outcome) => outcome.duplicate)).toContain(false);
    expect(outcomes.map((outcome) => outcome.duplicate)).toContain(true);
    expect(store.captures).toHaveLength(1);
    expect(store.transactions).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
    expect(store.touches).toBe(1);
  });

  it("preserves Telegram registration after the shared capture channel expansion", async () => {
    const { store } = setup();
    let sequence = 0;
    const telegram = new ProcessCapture({
      captures: store,
      transactions: store,
      paymentMethods: store,
      confirmationPolicies: { async findByWorkspaceAndChannel() { return { channel: "telegram", mode: "never_confirm" as const, confidenceThreshold: null }; } },
      interpreter: new SpanishExpenseInterpreter(),
      nextId: () => `50000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    });
    await expect(telegram.execute({ workspaceId, externalMessageId: "telegram-regression-1", channel: "telegram", message: "Gaste 15.000 colones en Gasolina pague con Tarjeta" })).resolves.toMatchObject({ status: "registered", duplicate: false, transaction: { paymentMethod: "card" } });
  });
});
