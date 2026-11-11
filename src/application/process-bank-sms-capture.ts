import { createHash } from "node:crypto";

import { BankSmsTemplate, CoopeAndePurchaseParser } from "../domain/bank-sms/coope-ande-purchase.js";
import { ExpenseDraft } from "../domain/transactions/expense-draft.js";
import { Money } from "../domain/transactions/money.js";
import type {
  BankSmsCaptureAuditRepository,
  BankSmsCredentialRepository,
  BankSmsTemplateRepository,
  CaptureRepository,
  PaymentMethodCatalogRepository,
  TransactionRecord,
  TransactionRepository
} from "./ports.js";

interface Dependencies {
  captures: CaptureRepository;
  transactions: TransactionRepository;
  paymentMethods: PaymentMethodCatalogRepository;
  credentials: BankSmsCredentialRepository;
  templates: BankSmsTemplateRepository;
  audits: BankSmsCaptureAuditRepository;
  nextId: () => string;
}

export interface ProcessBankSmsCaptureInput {
  token: string;
  eventId: string;
  sender: string;
  message: string;
  receivedAt: Date;
}

type PublicTransaction = Omit<TransactionRecord, "id" | "workspaceId" | "captureId" | "confidence"> & {
  confidence: number;
};

export interface ProcessBankSmsCaptureOutput {
  status: "registered";
  transactionId: string;
  transaction: PublicTransaction;
  duplicate: boolean;
}

export class ProcessBankSmsCapture {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: ProcessBankSmsCaptureInput): Promise<ProcessBankSmsCaptureOutput> {
    const credential = await this.authenticate(input.token);
    const templateRecord = await this.dependencies.templates.resolveActive(credential.workspaceId);
    if (!templateRecord) throw new Error("bank SMS template is unavailable");

    const parser = new CoopeAndePurchaseParser(BankSmsTemplate.create({
      version: templateRecord.version,
      body: templateRecord.body
    }));
    const purchase = parser.parse({ sender: input.sender, message: input.message });
    if (purchase.sender !== templateRecord.sender) {
      throw new Error("bank SMS sender does not match the configured template");
    }

    const paymentMethod = await this.dependencies.paymentMethods.findEnabled(
      credential.workspaceId,
      templateRecord.paymentMethod
    );
    if (!paymentMethod) throw new Error("bank SMS payment method is unavailable");

    const draft = ExpenseDraft.create({
      rawMessage: purchase.audit.redactedMessage,
      money: Money.fromDecimal(String(purchase.amountCrc), "CRC"),
      concept: purchase.merchant,
      paymentMethod: paymentMethod.code,
      sourceChannel: "bank_sms",
      confidence: 1
    });
    const capture = await this.dependencies.captures.createOrGet({
      id: this.dependencies.nextId(),
      workspaceId: credential.workspaceId,
      externalMessageId: input.eventId,
      channel: "bank_sms",
      rawMessage: purchase.audit.redactedMessage,
      status: "received"
    });
    const existing = await this.dependencies.transactions.findByCaptureId(credential.workspaceId, capture.id);
    if (existing) return this.success(existing, true);

    await this.dependencies.audits.saveOrGetAudit({
      captureId: capture.id,
      workspaceId: credential.workspaceId,
      messageHash: purchase.audit.hash,
      templateId: templateRecord.id,
      templateVersion: templateRecord.version,
      credentialId: credential.id,
      receivedAt: input.receivedAt
    });
    const values = draft.toPrimitives();
    const saved = await this.dependencies.transactions.saveOrGet({
      id: this.dependencies.nextId(),
      workspaceId: credential.workspaceId,
      captureId: capture.id,
      transactionType: "expense",
      amount: values.amount,
      currency: values.currency,
      concept: values.concept,
      paymentMethod: values.paymentMethod,
      status: "registered",
      confidence: values.confidence.toFixed(4)
    });
    if (saved.created) await this.dependencies.credentials.touchLastUsed(credential.workspaceId, credential.id);
    return this.success(saved.transaction, !saved.created);
  }

  private async authenticate(token: string) {
    if (!/^[A-Za-z0-9_-]{32,512}$/.test(token)) throw new Error("bank SMS authentication failed");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const credential = await this.dependencies.credentials.findActiveByTokenHash(tokenHash);
    if (!credential) throw new Error("bank SMS authentication failed");
    return credential;
  }

  private success(record: TransactionRecord, duplicate: boolean): ProcessBankSmsCaptureOutput {
    return {
      status: "registered",
      transactionId: record.id,
      transaction: {
        transactionType: record.transactionType,
        amount: record.amount,
        currency: record.currency,
        concept: record.concept,
        paymentMethod: record.paymentMethod,
        status: record.status,
        confidence: Number(record.confidence)
      },
      duplicate
    };
  }
}
