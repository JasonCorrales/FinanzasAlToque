import { describe, expect, it } from "vitest";

import { ConfirmationPolicy } from "../../src/domain/confirmation-policies/confirmation-policy.js";
import { DomainValidationError } from "../../src/domain/shared/domain-validation-error.js";

describe("ConfirmationPolicy", () => {
  it.each([
    ["always_confirm", 0.99, "pending_confirmation"],
    ["confidence_based", 0.98, "registered"],
    ["confidence_based", 0.79, "pending_confirmation"],
    ["never_confirm", 0.1, "registered"]
  ] as const)(
    "resolves %s at confidence %s as %s",
    (mode, confidence, expected) => {
      const policy = ConfirmationPolicy.create({
        channel: "telegram",
        mode,
        confidenceThreshold: mode === "confidence_based" ? 0.8 : null
      });

      expect(policy.decide(confidence)).toBe(expected);
    }
  );

  it("requires a valid threshold for confidence-based confirmation", () => {
    expect(() =>
      ConfirmationPolicy.create({
        channel: "telegram",
        mode: "confidence_based",
        confidenceThreshold: null
      })
    ).toThrowError(new DomainValidationError("confidenceThreshold must be between 0 and 1"));
  });
});
