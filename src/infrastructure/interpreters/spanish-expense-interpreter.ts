import type { InterpretationResult, MessageInterpreter } from "../../application/ports.js";

export class SpanishExpenseInterpreter implements MessageInterpreter {
  async interpret(message: string): Promise<InterpretationResult> {
    const normalized = message.trim();
    const folded = normalized.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const missingFields: Array<"transactionType" | "amount" | "currency" | "concept" | "paymentMethod"> = [];

    if (!/\b(gaste|pague|compre)\b/.test(folded)) missingFields.push("transactionType");

    const moneyMatch = folded.match(/\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*(colones|crc)\b/);
    if (!moneyMatch) {
      missingFields.push("amount", "currency");
    }

    const conceptMatch = normalized.match(/\ben\s+(.+?)(?=\s+pag(?:u[eé]|ué)\s+con\b|$)/iu);
    if (!conceptMatch?.[1]?.trim()) missingFields.push("concept");

    const paymentMatch = folded.match(/\bcon\s+(tarjeta|efectivo|transferencia)\b/);
    if (!paymentMatch) missingFields.push("paymentMethod");

    if (missingFields.length > 0) return { kind: "incomplete", missingFields };

    const payment = paymentMatch![1]!;
    return {
      kind: "expense",
      amount: moneyMatch![1]!.replaceAll(".", "").replace(",", "."),
      currency: "CRC",
      concept: conceptMatch![1]!.trim(),
      paymentMethod: payment === "tarjeta" ? "card" : payment,
      paymentMethodLabel: payment[0]!.toUpperCase() + payment.slice(1),
      confidence: 0.98
    };
  }
}
