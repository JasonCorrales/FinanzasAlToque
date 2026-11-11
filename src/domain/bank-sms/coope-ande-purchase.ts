import { createHash } from "node:crypto";

import { DomainValidationError } from "../shared/domain-validation-error.js";

const PLACEHOLDER_PATTERN = /{([^{}]*)}/g;
const SENDER_PATTERN = /^\+506[ -]?\d{4}[ -]?\d{4}$/;
const COUPE_ANDE_SENDER = "+50662229581";
const MAX_CRC_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

export interface BankSmsTemplateInput {
  version: string;
  body: string;
}

export interface BankSmsPurchaseInput {
  sender: string;
  message: string;
}

export interface BankSmsAudit {
  redactedMessage: string;
  hash: string;
}

export interface CoopeAndePurchase {
  sender: string;
  merchant: string;
  amountCrc: number;
  templateVersion: string;
  audit: BankSmsAudit;
}

export class BankSmsTemplate {
  private constructor(
    readonly version: string,
    readonly body: string,
    private readonly pattern: RegExp
  ) {}

  static create(input: BankSmsTemplateInput): BankSmsTemplate {
    const version = input.version.trim();
    if (version.length === 0) {
      throw new DomainValidationError("template version is required");
    }

    if (input.body.length === 0) {
      throw new DomainValidationError("template body is required");
    }

    const placeholders = [...input.body.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
    const bodyWithoutPlaceholders = input.body.replace(PLACEHOLDER_PATTERN, "");
    if (bodyWithoutPlaceholders.includes("{") || bodyWithoutPlaceholders.includes("}")) {
      throw new DomainValidationError("template contains an invalid placeholder");
    }

    if (
      placeholders.length !== 2 ||
      placeholders[0] !== "merchant" ||
      placeholders[1] !== "amount" ||
      new Set(placeholders).size !== 2
    ) {
      throw new DomainValidationError("template must contain one {merchant} followed by one {amount}");
    }

    const literals = input.body.split(/{(?:merchant|amount)}/);
    if (literals.length !== 3 || literals.some((literal) => literal.length === 0)) {
      throw new DomainValidationError("template placeholders must have unambiguous literal boundaries");
    }

    const pattern = new RegExp(`^${literals.map(escapeRegularExpression).join("(.+?)")}$`);
    return new BankSmsTemplate(version, input.body, pattern);
  }

  match(message: string): { merchant: string; amount: string } | null {
    const matches = this.pattern.exec(message);
    if (!matches) return null;

    const merchant = matches[1];
    const amount = matches[2];
    if (merchant === undefined || amount === undefined) return null;
    return { merchant, amount };
  }
}

export class CoopeAndePurchaseParser {
  constructor(private readonly template: BankSmsTemplate) {}

  parse(input: BankSmsPurchaseInput): CoopeAndePurchase {
    const sender = normalizeCoopeAndeSender(input.sender);
    const captures = this.template.match(input.message);
    if (!captures) {
      throw new DomainValidationError("message does not match the complete bank SMS template");
    }

    const merchant = captures.merchant.trim();
    if (merchant.length === 0) {
      throw new DomainValidationError("merchant is required");
    }

    const amountCrc = parseCrcAmount(captures.amount);
    return {
      sender,
      merchant,
      amountCrc,
      templateVersion: this.template.version,
      audit: {
        redactedMessage: `bank_sms:coope_ande_purchase:sender=${sender}:merchant_length=${merchant.length}:amount_crc=${amountCrc}`,
        hash: createAuditHash(sender, input.message)
      }
    };
  }
}

function normalizeCoopeAndeSender(sender: string): string {
  if (!SENDER_PATTERN.test(sender)) {
    throw new DomainValidationError("sender must be the configured Coope Ande sender");
  }

  const normalized = sender.replaceAll(" ", "").replaceAll("-", "");
  if (normalized !== COUPE_ANDE_SENDER) {
    throw new DomainValidationError("sender must be the configured Coope Ande sender");
  }
  return normalized;
}

function parseCrcAmount(rawAmount: string): number {
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.00)?$/.test(rawAmount)) {
    throw new DomainValidationError("amount must be a positive whole CRC amount with valid separators");
  }

  const wholeAmount = rawAmount.replaceAll(",", "").replace(".00", "");
  const amount = BigInt(wholeAmount);
  if (amount <= 0n || amount > MAX_CRC_AMOUNT) {
    throw new DomainValidationError("amount must be a positive safely representable CRC amount");
  }
  return Number(amount);
}

function createAuditHash(sender: string, originalMessage: string): string {
  const input = JSON.stringify({ sender, message: originalMessage });
  return `sha256:v1:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
