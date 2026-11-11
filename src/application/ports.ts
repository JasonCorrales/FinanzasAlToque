import type { CaptureChannel } from "../domain/transactions/expense-draft.js";
import type { ConfirmationMode } from "../domain/confirmation-policies/confirmation-policy.js";

export interface CaptureRecord {
  id: string;
  workspaceId: string;
  externalMessageId: string;
  channel: CaptureChannel;
  rawMessage: string;
  status: "received" | "processed" | "rejected";
}

export interface TransactionRecord {
  id: string;
  workspaceId: string;
  captureId: string;
  transactionType: "expense";
  amount: string;
  currency: string;
  concept: string;
  paymentMethod: string;
  status: "registered" | "pending_confirmation" | "cancelled";
  confidence: string;
}

export interface ConfirmationPolicyRecord {
  id?: string;
  workspaceId?: string;
  channel: CaptureChannel;
  mode: ConfirmationMode;
  confidenceThreshold: string | null;
  version?: number;
}

export interface PaymentMethodRecord {
  workspaceId: string;
  code: string;
  label: string;
  enabled: boolean;
}

export interface CaptureRepository {
  createOrGet(input: CaptureRecord): Promise<CaptureRecord>;
}

export interface TransactionRepository {
  findByCaptureId(workspaceId: string, captureId: string): Promise<TransactionRecord | null>;
  saveOrGet(input: TransactionRecord): Promise<{ transaction: TransactionRecord; created: boolean }>;
}

export interface TransactionDecisionRepository {
  decide(
    workspaceId: string,
    transactionId: string,
    action: "confirm" | "cancel"
  ): Promise<TransactionRecord | null>;
}

export interface ConfirmationPolicyRepository {
  findByWorkspaceAndChannel(
    workspaceId: string,
    channel: CaptureChannel
  ): Promise<ConfirmationPolicyRecord | null>;
}

export interface PaymentMethodCatalogRepository {
  findEnabled(workspaceId: string, codeOrLabel: string): Promise<PaymentMethodRecord | null>;
}

export interface BankSmsDeviceCredentialRecord {
  id: string;
  workspaceId: string;
  deviceLabel: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface ActiveBankSmsDeviceCredential extends BankSmsDeviceCredentialRecord {}

export interface CreateBankSmsDeviceCredential {
  workspaceId: string;
  deviceLabel: string;
  tokenHash: string;
}

export interface BankSmsTemplateRecord {
  id: string;
  workspaceId: string;
  sender: string;
  body: string;
  version: string;
  paymentMethod: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignBankSmsTemplate {
  workspaceId: string;
  sender: string;
  body: string;
  version: string;
  paymentMethod: string;
}

export interface BankSmsCredentialRepository {
  create(input: CreateBankSmsDeviceCredential): Promise<BankSmsDeviceCredentialRecord>;
  listByWorkspace(workspaceId: string): Promise<BankSmsDeviceCredentialRecord[]>;
  findActiveByTokenHash(tokenHash: string): Promise<ActiveBankSmsDeviceCredential | null>;
  touchLastUsed(workspaceId: string, credentialId: string): Promise<BankSmsDeviceCredentialRecord | null>;
  revoke(workspaceId: string, credentialId: string): Promise<BankSmsDeviceCredentialRecord | null>;
  rotate(
    workspaceId: string,
    credentialId: string,
    input: Omit<CreateBankSmsDeviceCredential, "workspaceId">
  ): Promise<BankSmsDeviceCredentialRecord | null>;
}

export interface BankSmsTemplateRepository {
  assign(input: AssignBankSmsTemplate): Promise<BankSmsTemplateRecord>;
  listByWorkspace(workspaceId: string): Promise<BankSmsTemplateRecord[]>;
  resolveActive(workspaceId: string): Promise<BankSmsTemplateRecord | null>;
}

export type InterpretationResult =
  | {
      kind: "expense";
      amount: string;
      currency: string;
      concept: string;
      paymentMethod: string;
      paymentMethodLabel: string;
      confidence: number;
    }
  | {
      kind: "incomplete";
      missingFields: Array<"transactionType" | "amount" | "currency" | "concept" | "paymentMethod">;
    };

export interface MessageInterpreter {
  interpret(message: string): Promise<InterpretationResult>;
}
