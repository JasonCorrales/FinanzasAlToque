import { DomainValidationError } from "../shared/domain-validation-error.js";
import type { CaptureChannel } from "../transactions/expense-draft.js";

export type ConfirmationMode = "always_confirm" | "confidence_based" | "never_confirm";
export type ConfirmationDecision = "registered" | "pending_confirmation";

export interface CreateConfirmationPolicyInput {
  channel: CaptureChannel;
  mode: ConfirmationMode;
  confidenceThreshold: number | null;
}

export class ConfirmationPolicy {
  private constructor(private readonly values: CreateConfirmationPolicyInput) {}

  static create(input: CreateConfirmationPolicyInput): ConfirmationPolicy {
    if (
      input.mode === "confidence_based" &&
      (input.confidenceThreshold === null ||
        !Number.isFinite(input.confidenceThreshold) ||
        input.confidenceThreshold < 0 ||
        input.confidenceThreshold > 1)
    ) {
      throw new DomainValidationError("confidenceThreshold must be between 0 and 1");
    }

    return new ConfirmationPolicy(input);
  }

  decide(confidence: number): ConfirmationDecision {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new DomainValidationError("confidence must be between 0 and 1");
    }

    if (this.values.mode === "always_confirm") {
      return "pending_confirmation";
    }

    if (this.values.mode === "never_confirm") {
      return "registered";
    }

    return confidence >= this.values.confidenceThreshold! ? "registered" : "pending_confirmation";
  }

  toPrimitives() {
    return { ...this.values };
  }
}
