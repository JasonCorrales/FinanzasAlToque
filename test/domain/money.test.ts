import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../src/domain/shared/domain-validation-error.js";
import { Money } from "../../src/domain/transactions/money.js";

describe("Money", () => {
  it("preserves a positive decimal amount without converting it to a JavaScript number", () => {
    const money = Money.fromDecimal("15000.25", "crc");

    expect(money.amount).toBe("15000.25");
    expect(money.currency).toBe("CRC");
  });

  it.each(["0", "-1", "15,000", "not-money"])(
    "rejects the invalid amount %s",
    (amount) => {
      expect(() => Money.fromDecimal(amount, "CRC")).toThrow(DomainValidationError);
    }
  );

  it("rejects an invalid ISO currency code", () => {
    expect(() => Money.fromDecimal("15000", "colones")).toThrowError(
      new DomainValidationError("currency must be a three-letter ISO code")
    );
  });
});
