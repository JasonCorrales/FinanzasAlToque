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
  status: "registered" | "pending_confirmation";
  confidence: string;
}

export interface ConfirmationPolicyRecord {
  channel: CaptureChannel;
  mode: ConfirmationMode;
  confidenceThreshold: string | null;
}

export interface CaptureRepository {
  createOrGet(input: CaptureRecord): Promise<CaptureRecord>;
}

export interface TransactionRepository {
  findByCaptureId(workspaceId: string, captureId: string): Promise<TransactionRecord | null>;
  save(input: TransactionRecord): Promise<TransactionRecord>;
}

export interface ConfirmationPolicyRepository {
  findByWorkspaceAndChannel(
    workspaceId: string,
    channel: CaptureChannel
  ): Promise<ConfirmationPolicyRecord | null>;
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
