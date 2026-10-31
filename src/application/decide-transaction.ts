import type {
  TransactionDecisionRepository,
  TransactionRecord
} from "./ports.js";

export type TransactionDecisionOutput =
  | { status: "registered" | "cancelled"; message: string }
  | { status: "rejected"; message: string; reason: "not_found" | "invalid_transition" };

export class DecideTransaction {
  constructor(private readonly transactions: TransactionDecisionRepository) {}

  async execute(input: {
    workspaceId: string;
    transactionId: string;
    action: "confirm" | "cancel";
  }): Promise<TransactionDecisionOutput> {
    const transaction = await this.transactions.decide(
      input.workspaceId,
      input.transactionId,
      input.action
    );

    if (!transaction) {
      return {
        status: "rejected",
        message: "No encontré el gasto pendiente.",
        reason: "not_found"
      };
    }

    const expectedStatus = input.action === "confirm" ? "registered" : "cancelled";
    if (transaction.status !== expectedStatus) {
      return {
        status: "rejected",
        message: "El gasto ya fue procesado y no puede cambiarse.",
        reason: "invalid_transition"
      };
    }

    return {
      status: expectedStatus,
      message: `${input.action === "confirm" ? "Gasto confirmado" : "Gasto cancelado"}: ${this.summary(transaction)}.`
    };
  }

  private summary(transaction: TransactionRecord): string {
    const amount = Number.parseInt(transaction.amount, 10)
      .toLocaleString("es-CR")
      .replaceAll(" ", ".");
    return `₡${amount} ${transaction.currency} en ${transaction.concept}`;
  }
}
