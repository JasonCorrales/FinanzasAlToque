import { createHash } from "node:crypto";

import { BacEmailTemplate, BacPurchaseEmailParser } from "../domain/bank-email/bac-purchase-email.js";
import { DomainValidationError } from "../domain/shared/domain-validation-error.js";
import { ExpenseDraft } from "../domain/transactions/expense-draft.js";
import { Money } from "../domain/transactions/money.js";
import type {
  BankEmailCaptureAuditRepository,
  BankEmailCredentialRepository,
  BankEmailTemplateRepository,
  CaptureRepository,
  PaymentMethodCatalogRepository,
  TransactionRecord,
  TransactionRepository
} from "./ports.js";

const BAC_PURCHASE_SOURCE = "bac_purchase";
const BAC_PURCHASE_TEMPLATE_VERSION = "bac-email-v1";
const TRUSTED_DOMAIN = "baccredomatic.cr";

interface Dependencies {
  captures: CaptureRepository;
  transactions: TransactionRepository;
  paymentMethods: PaymentMethodCatalogRepository;
  credentials: BankEmailCredentialRepository;
  templates: BankEmailTemplateRepository;
  audits: BankEmailCaptureAuditRepository;
  nextId: () => string;
}

export interface ProcessBankEmailCaptureInput {
  token: string;
  eventId: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: Date;
  authentication: {
    spf: "pass" | "fail";
    dkim: "pass" | "fail";
    dmarc: "pass" | "fail";
    domain: string;
  };
}

type PublicTransaction = Omit<TransactionRecord, "id" | "workspaceId" | "captureId" | "confidence"> & {
  confidence: number;
};

export interface ProcessBankEmailCaptureOutput {
  status: "registered";
  transactionId: string;
  transaction: PublicTransaction;
  duplicate: boolean;
}

export class BankEmailAuthenticationError extends Error {
  constructor() {
    super("bank email authentication failed");
    this.name = "BankEmailAuthenticationError";
  }
}

export class BankEmailValidationError extends Error {
  constructor(message = "bank email capture does not match the configured template") {
    super(message);
    this.name = "BankEmailValidationError";
  }
}

export class BankEmailConfigurationError extends Error {
  constructor(message = "bank email configuration is unavailable") {
    super(message);
    this.name = "BankEmailConfigurationError";
  }
}

export class ProcessBankEmailCapture {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: ProcessBankEmailCaptureInput): Promise<ProcessBankEmailCaptureOutput> {
    const credential = await this.authenticate(input.token);
    this.requireAuthenticationEvidence(input.authentication);
    this.requireReceivedAt(input.receivedAt);

    const templateRecord = await this.dependencies.templates.resolveActive(credential.workspaceId, BAC_PURCHASE_SOURCE);
    if (
      !templateRecord ||
      !templateRecord.active ||
      templateRecord.workspaceId !== credential.workspaceId ||
      templateRecord.source !== BAC_PURCHASE_SOURCE ||
      templateRecord.version !== BAC_PURCHASE_TEMPLATE_VERSION ||
      templateRecord.institution !== "BAC" ||
      templateRecord.cardBrand !== "VISA" ||
      !/^\d{4}$/.test(templateRecord.cardLastFour ?? "")
    ) {
      throw new BankEmailConfigurationError("BAC purchase email template is unavailable");
    }

    let purchase;
    try {
      purchase = new BacPurchaseEmailParser(BacEmailTemplate.create({
        id: templateRecord.id,
        version: templateRecord.version
      })).parse({ sender: input.sender, subject: input.subject, body: input.body });
    } catch (error) {
      if (error instanceof DomainValidationError) throw new BankEmailValidationError(error.message);
      throw error;
    }

    if (
      purchase.card.institution !== templateRecord.institution ||
      purchase.card.brand !== templateRecord.cardBrand ||
      purchase.card.lastFour !== templateRecord.cardLastFour
    ) {
      throw new BankEmailValidationError();
    }

    const paymentMethod = await this.dependencies.paymentMethods.findEnabled(
      credential.workspaceId,
      templateRecord.paymentMethod
    );
    if (!paymentMethod || paymentMethod.workspaceId !== credential.workspaceId || !paymentMethod.enabled) {
      throw new BankEmailConfigurationError("BAC purchase email payment method is unavailable");
    }

    const draft = ExpenseDraft.create({
      rawMessage: purchase.audit.redactedMetadata,
      money: Money.fromDecimal(purchase.amount, purchase.currency),
      concept: purchase.merchant,
      paymentMethod: paymentMethod.code,
      sourceChannel: "bank_email",
      confidence: 1
    });
    const capture = await this.dependencies.captures.createOrGet({
      id: this.dependencies.nextId(),
      workspaceId: credential.workspaceId,
      externalMessageId: this.requireEventId(input.eventId),
      channel: "bank_email",
      rawMessage: "bank_email:bac_purchase:result=accepted",
      status: "received"
    });
    if (capture.workspaceId !== credential.workspaceId || capture.channel !== "bank_email") {
      throw new BankEmailConfigurationError("bank email capture workspace is unavailable");
    }
    const existing = await this.dependencies.transactions.findByCaptureId(credential.workspaceId, capture.id);
    if (existing) return this.success(existing, true);

    await this.dependencies.audits.saveOrGetAudit({
      captureId: capture.id,
      workspaceId: credential.workspaceId,
      messageHash: purchase.audit.hash,
      templateId: purchase.templateId,
      templateVersion: purchase.templateVersion,
      redactedMetadata: purchase.audit.redactedMetadata,
      authenticationResult: "passed",
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
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,512}$/.test(token)) throw new BankEmailAuthenticationError();
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const credential = await this.dependencies.credentials.findActiveByTokenHash(tokenHash);
    if (!credential || !credential.active) throw new BankEmailAuthenticationError();
    return credential;
  }

  private requireAuthenticationEvidence(authentication: ProcessBankEmailCaptureInput["authentication"]): void {
    if (
      !authentication ||
      authentication.spf !== "pass" ||
      authentication.dkim !== "pass" ||
      authentication.dmarc !== "pass" ||
      typeof authentication.domain !== "string" ||
      authentication.domain.toLowerCase() !== TRUSTED_DOMAIN
    ) {
      throw new BankEmailAuthenticationError();
    }
  }

  private requireReceivedAt(receivedAt: Date): void {
    if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
      throw new BankEmailValidationError("bank email receipt timestamp is invalid");
    }
  }

  private requireEventId(eventId: string): string {
    if (typeof eventId !== "string" || eventId.trim().length === 0) {
      throw new BankEmailValidationError("bank email event ID is required");
    }
    return eventId;
  }

  private success(record: TransactionRecord, duplicate: boolean): ProcessBankEmailCaptureOutput {
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
