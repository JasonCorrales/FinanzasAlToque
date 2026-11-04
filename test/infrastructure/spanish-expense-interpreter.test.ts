import { describe, expect, it } from "vitest";

import { SpanishExpenseInterpreter } from "../../src/infrastructure/interpreters/spanish-expense-interpreter.js";

describe("SpanishExpenseInterpreter", () => {
  it("extracts a maintained payment-method label after 'pague con'", async () => {
    const interpreter = new SpanishExpenseInterpreter();

    await expect(
      interpreter.interpret("Gaste 15.000 colones en Gasolina pague con Sinpe Móvil")
    ).resolves.toMatchObject({
      kind: "expense",
      amount: "15000",
      currency: "CRC",
      concept: "Gasolina",
      paymentMethod: "Sinpe Móvil",
      paymentMethodLabel: "Sinpe Móvil"
    });
  });

  it("supports the accented 'pagué con' form", async () => {
    const interpreter = new SpanishExpenseInterpreter();

    await expect(
      interpreter.interpret("Pagué 15.000 colones en Gasolina pagué con Tarjeta")
    ).resolves.toMatchObject({ kind: "expense", paymentMethod: "Tarjeta" });
  });

  it("extracts the common payment phrase using its final 'con' separator", async () => {
    const interpreter = new SpanishExpenseInterpreter();

    await expect(
      interpreter.interpret("Pagué 15.000 colones en Cena con amigos con Tarjeta")
    ).resolves.toMatchObject({
      kind: "expense",
      amount: "15000",
      currency: "CRC",
      concept: "Cena con amigos",
      paymentMethod: "Tarjeta"
    });
  });

  it("requires a payment method when 'pague con' has no value", async () => {
    const interpreter = new SpanishExpenseInterpreter();

    await expect(interpreter.interpret("Gaste 15.000 colones en Gasolina pague con")).resolves.toEqual({
      kind: "incomplete",
      missingFields: ["paymentMethod"]
    });
  });
});
