import { createHash } from "node:crypto";

import { DomainValidationError } from "../shared/domain-validation-error.js";

const BAC_SENDER = "NotificacionBAC@baccredomatic.cr";
const SUBJECT_PATTERN = /^Notificación de transacción ([^\r\n]+) (\d{2}-\d{2}-\d{4}) - ((?:[01]\d|2[0-3]):[0-5]\d)$/;
const BODY_PATTERN = new RegExp(
  "^" +
    "[^\\r\\n]+\\n(?:[ \\t]*\\n)+[^\\r\\n]+\\n(?:[ \\t]*\\n)+" +
    "Comercio[ \\t]*:[ \\t]*([^\\r\\n]*\\S)[ \\t]*\\n" +
    "Ciudad y país[ \\t]*:[ \\t]*([^\\r\\n]*\\S)[ \\t]*\\n" +
    "Fecha[ \\t]*:[ \\t]*([A-Z][a-z]{2})[ \\t]+([0-3]\\d),[ \\t]+(\\d{4}),[ \\t]+((?:[01]\\d|2[0-3]):[0-5]\\d)[ \\t]*\\n" +
    "VISA[ \\t]*:[ \\t]*(\\d{4})[ \\t]*\\n" +
    "Autorización[ \\t]*:[ \\t]*([^\\r\\n]*\\S)[ \\t]*\\n" +
    "Referencia[ \\t]*:[ \\t]*([^\\r\\n]*\\S)[ \\t]*\\n" +
    "Tipo de Transacción[ \\t]*:[ \\t]*(COMPRA)[ \\t]*\\n" +
    "Monto[ \\t]*:[ \\t]*(CRC|USD)[ \\t]+((?:0|[1-9]\\d*)\\.\\d{2})[ \\t]*$"
);
const ENGLISH_MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12
};

export interface BacEmailTemplateInput {
  id: string;
  version: string;
}

export interface BacPurchaseEmailInput {
  sender: string;
  subject: string;
  body: string;
}

export interface BacPurchaseEmailAudit {
  redactedMetadata: string;
  hash: string;
}

export interface BacPurchaseEmail {
  sender: string;
  subject: string;
  merchant: string;
  cityAndCountry: string;
  date: string;
  time: string;
  card: {
    institution: "BAC";
    brand: "VISA";
    lastFour: string;
  };
  authorization: string;
  reference: string;
  transactionType: "COMPRA";
  currency: string;
  amount: string;
  templateId: string;
  templateVersion: string;
  audit: BacPurchaseEmailAudit;
}

export class BacEmailTemplate {
  private constructor(
    readonly id: string,
    readonly version: string
  ) {}

  static create(input: BacEmailTemplateInput): BacEmailTemplate {
    const id = requireNonEmptyNormalizedText(input.id, "template id");
    const version = requireNonEmptyNormalizedText(input.version, "template version");
    return new BacEmailTemplate(id, version);
  }
}

export class BacPurchaseEmailParser {
  constructor(private readonly template: BacEmailTemplate) {}

  parse(input: BacPurchaseEmailInput): BacPurchaseEmail {
    if (normalizeText(input.sender, "sender").toLowerCase() !== BAC_SENDER.toLowerCase()) {
      throw new DomainValidationError("sender must be the configured BAC sender");
    }
    const sender = BAC_SENDER;

    const subject = normalizeText(input.subject, "subject");
    const subjectMatch = SUBJECT_PATTERN.exec(subject);
    if (!subjectMatch) {
      throw new DomainValidationError("subject must match the complete BAC transaction subject");
    }

    const body = normalizeText(input.body, "body").replaceAll("\r\n", "\n");
    const bodyMatch = BODY_PATTERN.exec(body);
    if (!bodyMatch) {
      throw new DomainValidationError("body must match the complete BAC purchase template");
    }

    const [, subjectMerchant, subjectDate, subjectTime] = subjectMatch;
    const [
      ,
      merchant,
      cityAndCountry,
      bodyMonth,
      bodyDay,
      bodyYear,
      bodyTime,
      lastFour,
      authorization,
      reference,
      transactionType,
      currency,
      amount
    ] = bodyMatch;
    if (
      subjectMerchant === undefined ||
      subjectDate === undefined ||
      subjectTime === undefined ||
      merchant === undefined ||
      cityAndCountry === undefined ||
      bodyMonth === undefined ||
      bodyDay === undefined ||
      bodyYear === undefined ||
      bodyTime === undefined ||
      lastFour === undefined ||
      authorization === undefined ||
      reference === undefined ||
      transactionType === undefined ||
      currency === undefined ||
      amount === undefined
    ) {
      throw new DomainValidationError("body must contain every required BAC purchase field");
    }

    const subjectIsoDate = toIsoDateFromSubject(subjectDate);
    const date = toIsoDateFromEnglishMonth(bodyMonth, bodyDay, bodyYear);
    if (subjectMerchant !== merchant || subjectIsoDate !== date || subjectTime !== bodyTime) {
      throw new DomainValidationError("subject merchant, date, and time must match the BAC body");
    }

    return {
      sender,
      subject,
      merchant,
      cityAndCountry,
      date,
      time: bodyTime,
      card: { institution: "BAC", brand: "VISA", lastFour },
      authorization,
      reference,
      transactionType: transactionType as "COMPRA",
      currency,
      amount,
      templateId: this.template.id,
      templateVersion: this.template.version,
      audit: {
        redactedMetadata: `bank_email:bac_purchase:channel=bank_email:template=${this.template.id}:version=${this.template.version}:result=purchase`,
        hash: createAuditHash(this.template, sender, subject, body)
      }
    };
  }
}

function normalizeText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new DomainValidationError(`${field} must be text`);
  }
  return value.normalize("NFC");
}

function requireNonEmptyNormalizedText(value: unknown, field: string): string {
  const normalized = normalizeText(value, field).trim();
  if (normalized.length === 0) {
    throw new DomainValidationError(`${field} is required`);
  }
  return normalized;
}

function toIsoDateFromSubject(value: string): string {
  const [dayText, monthText, yearText] = value.split("-");
  return toIsoDate(Number(yearText), Number(monthText), Number(dayText));
}

function toIsoDateFromEnglishMonth(monthText: string, dayText: string, yearText: string): string {
  const month = ENGLISH_MONTHS[monthText];
  if (month === undefined) {
    throw new DomainValidationError("date must use an English month abbreviation");
  }
  return toIsoDate(Number(yearText), month, Number(dayText));
}

function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DomainValidationError("date must be a valid calendar date");
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function createAuditHash(template: BacEmailTemplate, sender: string, subject: string, body: string): string {
  const input = JSON.stringify({
    templateId: template.id,
    templateVersion: template.version,
    sender,
    subject,
    body
  });
  return `sha256:v1:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}
