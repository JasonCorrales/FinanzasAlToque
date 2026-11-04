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
