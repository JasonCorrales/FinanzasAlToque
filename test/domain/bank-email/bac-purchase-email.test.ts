import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../../src/domain/shared/domain-validation-error.js";
import {
  BacEmailTemplate,
  BacPurchaseEmailParser
} from "../../../src/domain/bank-email/bac-purchase-email.js";

const template = BacEmailTemplate.create({ id: "bac-purchase-v1", version: "1" });
const sender = "NotificacionBAC@baccredomatic.cr";
const subject = "Notificación de transacción APPLE.COM/BILL 17-11-2026 - 18:07";
const customer = "Cliente Sintético";
const body = [
  `Estimado(a) ${customer},`,
  "",
  "Le informamos que se realizó una transacción con su tarjeta.",
  "",
  "Comercio:   APPLE.COM/BILL",
  "Ciudad y país:\t CUPERTINO, ESTADOS UNIDOS",
  "Fecha:  Nov 17, 2026, 18:07",
  "VISA:  4242",
  "Autorización:\tAUTH-SYNTH-0001",
  "Referencia:  REF-SYNTH-0001",
  "Tipo de Transacción: COMPRA",
  "Monto:   USD 2.99"
].join("\n");

describe("BacPurchaseEmailParser", () => {
  it("accepts only the normalized BAC sender and fully anchored normalized subject contract", () => {
    const parsed = new BacPurchaseEmailParser(template).parse({
      sender: "notificacionbac@BACCredomatic.cr",
      subject: "Notificacio\u0301n de transaccio\u0301n APPLE.COM/BILL 17-11-2026 - 18:07",
      body
    });

    expect(parsed.sender).toBe(sender);
    expect(parsed.subject).toBe(subject);
    expect(() => new BacPurchaseEmailParser(template).parse({ sender, subject: `${subject} extra`, body })).toThrow(DomainValidationError);
    expect(() => new BacPurchaseEmailParser(template).parse({ sender: "alerts@baccredomatic.cr", subject, body })).toThrow(DomainValidationError);
  });

  it("parses the complete BAC COMPRA body with English-month date, variable spacing, explicit ISO currency, and card identity", () => {
    const parsed = new BacPurchaseEmailParser(template).parse({ sender, subject, body });

    expect(parsed).toMatchObject({
      merchant: "APPLE.COM/BILL",
      cityAndCountry: "CUPERTINO, ESTADOS UNIDOS",
      date: "2026-11-17",
      time: "18:07",
      transactionType: "COMPRA",
      currency: "USD",
      amount: "2.99",
      card: { institution: "BAC", brand: "VISA", lastFour: "4242" },
      authorization: "AUTH-SYNTH-0001",
      reference: "REF-SYNTH-0001",
      templateId: "bac-purchase-v1",
      templateVersion: "1"
    });

    expect(JSON.stringify(parsed)).not.toContain(customer);
    expect(() => new BacPurchaseEmailParser(template).parse({
      sender,
      subject,
      body: body.replace("Monto:   USD 2.99", "Monto: USD 2.9")
    })).toThrow(DomainValidationError);
  });

  it("accepts supported CRC and rejects unsupported ISO currency codes", () => {
    const parser = new BacPurchaseEmailParser(template);

    expect(parser.parse({
      sender,
      subject,
      body: body.replace("Monto:   USD 2.99", "Monto: CRC 1234.56")
    })).toMatchObject({ currency: "CRC", amount: "1234.56" });
    expect(() => parser.parse({
      sender,
      subject,
      body: body.replace("Monto:   USD 2.99", "Monto: ZZZ 2.99")
    })).toThrow(DomainValidationError);
  });

  it("fails closed when canonical body merchant, date, time, or required fields disagree with the subject", () => {
    const parser = new BacPurchaseEmailParser(template);

    for (const invalidBody of [
      body.replace("APPLE.COM/BILL", "OTHER SHOP"),
      body.replace("Nov 17, 2026", "Nov 18, 2026"),
      body.replace("18:07", "18:08"),
      body.replace("Referencia:  REF-SYNTH-0001\n", "")
    ]) {
      expect(() => parser.parse({ sender, subject, body: invalidBody })).toThrow(DomainValidationError);
    }
  });

  it("accepts a variable customer greeting but rejects extra non-whitespace envelope content or fields", () => {
    const parser = new BacPurchaseEmailParser(template);

    expect(() => parser.parse({
      sender,
      subject,
      body: body.replace(customer, "Otra Persona Sintética")
    })).not.toThrow();
    for (const invalidBody of [
      `Aviso inesperado\n${body}`,
      `${body}\nTexto inesperado`,
      `${body}\nCódigo: EXTRA`
    ]) {
      expect(() => parser.parse({ sender, subject, body: invalidBody })).toThrow(DomainValidationError);
    }
  });

  it("returns versioned audit metadata that excludes amount, currency, raw body, and sensitive fields", () => {
    const parsed = new BacPurchaseEmailParser(template).parse({ sender, subject, body });

    expect(parsed.audit).toMatchObject({
      redactedMetadata: "bank_email:bac_purchase:channel=bank_email:template=bac-purchase-v1:version=1:result=purchase",
      hash: expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(parsed.audit)).not.toContain(body);
    for (const sensitiveValue of [
      customer,
      "APPLE.COM/BILL",
      "CUPERTINO, ESTADOS UNIDOS",
      "4242",
      "AUTH-SYNTH-0001",
      "REF-SYNTH-0001",
      "USD",
      "2.99"
    ]) {
      expect(JSON.stringify(parsed.audit)).not.toContain(sensitiveValue);
    }
  });
});
