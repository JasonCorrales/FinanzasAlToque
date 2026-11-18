import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../../src/domain/shared/domain-validation-error.js";
import {
  BankSmsTemplate,
  CoopeAndePurchaseParser
} from "../../../src/domain/bank-sms/coope-ande-purchase.js";

const message = "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Super Mercado por 5,300.00 colones";
const template = BankSmsTemplate.create({
  version: "1",
  body: "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones"
});

describe("CoopeAndePurchaseParser", () => {
  it("parses only the exact normalized sender and complete configured Coope Ande message", () => {
    const parsed = new CoopeAndePurchaseParser(template).parse({
      sender: "+506 6222-9581",
      message
    });

    expect(parsed).toMatchObject({
      sender: "+50662229581",
      merchant: "Super Mercado",
      amountCrc: "5300.00",
      templateVersion: "1"
    });
    expect(() => new CoopeAndePurchaseParser(template).parse({
      sender: "+50662229581",
      message: `${message} confirmado`
    })).toThrow(DomainValidationError);
  });

  it("parses the reported purchase with a two-digit CRC fractional amount", () => {
    const reportedMessage = "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Rosti Pollos N Jose C Ri por 13,270.01 colones";

    const parsed = new CoopeAndePurchaseParser(template).parse({
      sender: "+50662229581",
      message: reportedMessage
    });

    expect(parsed).toMatchObject({
      merchant: "Rosti Pollos N Jose C Ri",
      amountCrc: "13270.01"
    });
    expect(parsed.audit.redactedMessage).toBe(
      "bank_sms:coope_ande_purchase:sender=+50662229581:merchant_length=24:amount_crc=13270.01"
    );
    expect(parsed.audit.redactedMessage).not.toContain("Rosti Pollos N Jose C Ri");
    expect(parsed.audit.redactedMessage).not.toContain(reportedMessage);
  });

  it.each([
    ["5,300", "5300.00"],
    ["5,300.00", "5300.00"],
    ["5,300.50", "5300.50"]
  ])("canonicalizes CRC amount %s as %s", (rawAmount, amountCrc) => {
    const parsed = new CoopeAndePurchaseParser(template).parse({
      sender: "+50662229581",
      message: `Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por ${rawAmount} colones`
    });

    expect(parsed.amountCrc).toBe(amountCrc);
  });

  it("creates privacy-safe, versioned audit metadata without retaining the merchant or whole message", () => {
    const parsed = new CoopeAndePurchaseParser(template).parse({
      sender: "+506 6222-9581",
      message
    });

    expect(parsed.audit).toEqual({
      redactedMessage: "bank_sms:coope_ande_purchase:sender=+50662229581:merchant_length=13:amount_crc=5300.00",
      hash: "sha256:v1:3e1367a933150a4d666d36ca49f52ae220e6c268375bccdf4d1ce52ea1e5984a"
    });
    expect(parsed.audit.redactedMessage).not.toContain("Super Mercado");
    expect(parsed.audit.redactedMessage).not.toContain(message);
  });

  it.each([
    "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por 5,300.5 colones",
    "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por 5,300.000 colones",
    "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por 5.300,00 colones",
    "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por 5,30.00 colones",
    "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por 0.00 colones",
    "Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Shop por 9007199254740992 colones"
  ])("rejects malformed, zero, or unsafe CRC amount %s", (invalidMessage) => {
    expect(() => new CoopeAndePurchaseParser(template).parse({
      sender: "+50662229581",
      message: invalidMessage
    })).toThrow(DomainValidationError);
  });

  it.each([
    "Coope Ande {merchant} {merchant} por {amount} colones",
    "Coope Ande {merchant} por {amount} {currency}",
    "Coope Ande {amount} por {merchant} colones",
    "Coope Ande {merchant}{amount} colones"
  ])("rejects unsafe template %s", (body) => {
    expect(() => BankSmsTemplate.create({ version: "1", body })).toThrow(DomainValidationError);
  });

  it("rejects any sender other than the configured phone number", () => {
    expect(() => new CoopeAndePurchaseParser(template).parse({
      sender: "+50662229582",
      message
    })).toThrow(DomainValidationError);
  });
});
