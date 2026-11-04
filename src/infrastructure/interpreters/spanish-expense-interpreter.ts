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

    const legacyConceptMatch = normalized.match(/\ben\s+(.+?)(?=\s+pag(?:u[eé]|ué)\s+con\b)/iu);
    const legacyPaymentMatch = normalized.match(/\bpag(?:ue|ué)\s+con\s+(.+?)\s*[.!?]*\s*$/iu);
    const commonPaymentMatch = normalized.match(/\ben\s+(.+)\s+con\s+(.+?)\s*[.!?]*\s*$/iu);
    const conceptMatch = legacyConceptMatch
      ?? commonPaymentMatch
      ?? normalized.match(/\ben\s+(.+?)\s*[.!?]*\s*$/iu);
    if (!conceptMatch?.[1]?.trim()) missingFields.push("concept");

    const paymentMatch = legacyPaymentMatch ?? (legacyConceptMatch
      ? null
      : commonPaymentMatch && [commonPaymentMatch[0], commonPaymentMatch[2]]);
    if (!paymentMatch?.[1]?.trim()) missingFields.push("paymentMethod");

    if (missingFields.length > 0) return { kind: "incomplete", missingFields };

    const payment = paymentMatch![1]!.trim();
    return {
      kind: "expense",
      amount: moneyMatch![1]!.replaceAll(".", "").replace(",", "."),
      currency: "CRC",
      concept: conceptMatch![1]!.trim(),
      paymentMethod: payment,
      paymentMethodLabel: payment,
      confidence: 0.98
    };
  }
}
