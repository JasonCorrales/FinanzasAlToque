import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../src/domain/shared/domain-validation-error.js";
import { ExpenseDraft } from "../../src/domain/transactions/expense-draft.js";
import { Money } from "../../src/domain/transactions/money.js";

const validInput = {
  rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
  money: Money.fromDecimal("15000", "CRC"),
  concept: "Gasolina",
  paymentMethod: "card",
  sourceChannel: "telegram" as const,
  confidence: 0.98
};

describe("ExpenseDraft", () => {
  it("retains every required normalized field and the original capture", () => {
    const draft = ExpenseDraft.create(validInput);

    expect(draft.toPrimitives()).toEqual({
      transactionType: "expense",
      amount: "15000",
      currency: "CRC",
      concept: "Gasolina",
      paymentMethod: "card",
      sourceChannel: "telegram",
      rawMessage: "Gaste 15.000 colones en Gasolina pague con Tarjeta",
      confidence: 0.98
    });
  });

  it.each([
    ["concept", { ...validInput, concept: " " }],
    ["paymentMethod", { ...validInput, paymentMethod: "" }],
    ["rawMessage", { ...validInput, rawMessage: "" }]
  ])("rejects a missing %s without creating a draft", (field, input) => {
    expect(() => ExpenseDraft.create(input)).toThrowError(
      new DomainValidationError(`${field} is required`)
    );
  });
});
