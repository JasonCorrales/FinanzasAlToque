import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../src/domain/shared/domain-validation-error.js";
import { Money } from "../../src/domain/transactions/money.js";

describe("Money", () => {
  it.each([
    ["15000", "15000.00"],
    ["15000.2", "15000.20"],
    ["15000.25", "15000.25"]
  ])("canonicalizes positive decimal strings without converting them to JavaScript numbers", (rawAmount, amount) => {
    const money = Money.fromDecimal(rawAmount, "crc");

    expect(money.amount).toBe(amount);
    expect(money.currency).toBe("CRC");
  });

  it.each(["0", "-1", "15,000", "not-money", "15000.001", "15000."])(
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
