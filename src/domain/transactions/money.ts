import { DomainValidationError } from "../shared/domain-validation-error.js";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    readonly amount: string,
    readonly currency: string
  ) {}

  static fromDecimal(rawAmount: string, rawCurrency: string): Money {
    const amount = rawAmount.trim();
    const currency = rawCurrency.trim().toUpperCase();

    if (!DECIMAL_PATTERN.test(amount) || !Money.isPositive(amount)) {
      throw new DomainValidationError("amount must be a positive decimal string");
    }

    if (!ISO_CURRENCY_PATTERN.test(currency)) {
      throw new DomainValidationError("currency must be a three-letter ISO code");
    }

    return new Money(amount, currency);
  }

  private static isPositive(amount: string): boolean {
    return BigInt(amount.replace(".", "")) > 0n;
  }
}
