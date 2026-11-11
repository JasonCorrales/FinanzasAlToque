import { DomainValidationError } from "../shared/domain-validation-error.js";
import { Money } from "./money.js";

export type CaptureChannel = "telegram" | "bank_sms";

export interface CreateExpenseDraftInput {
  rawMessage: string;
  money: Money;
  concept: string;
  paymentMethod: string;
  sourceChannel: CaptureChannel;
  confidence: number;
}

export class ExpenseDraft {
  private constructor(private readonly values: CreateExpenseDraftInput) {}

  static create(input: CreateExpenseDraftInput): ExpenseDraft {
    const rawMessage = ExpenseDraft.required(input.rawMessage, "rawMessage");
    const concept = ExpenseDraft.required(input.concept, "concept");
    const paymentMethod = ExpenseDraft.required(input.paymentMethod, "paymentMethod");

    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
      throw new DomainValidationError("confidence must be between 0 and 1");
    }

    return new ExpenseDraft({
      ...input,
      rawMessage,
      concept,
      paymentMethod
    });
  }

  toPrimitives() {
    return {
      transactionType: "expense" as const,
      amount: this.values.money.amount,
      currency: this.values.money.currency,
      concept: this.values.concept,
      paymentMethod: this.values.paymentMethod,
      sourceChannel: this.values.sourceChannel,
      rawMessage: this.values.rawMessage,
      confidence: this.values.confidence
    };
  }

  private static required(value: string, field: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new DomainValidationError(`${field} is required`);
    }
    return normalized;
  }
}
