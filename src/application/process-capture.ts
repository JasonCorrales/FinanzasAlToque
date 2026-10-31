import { ConfirmationPolicy } from "../domain/confirmation-policies/confirmation-policy.js";
import { ExpenseDraft, type CaptureChannel } from "../domain/transactions/expense-draft.js";
import { Money } from "../domain/transactions/money.js";
import type {
  CaptureRepository,
  ConfirmationPolicyRepository,
  MessageInterpreter,
  TransactionRecord,
  TransactionRepository
} from "./ports.js";

interface Dependencies {
  captures: CaptureRepository;
  transactions: TransactionRepository;
  confirmationPolicies: ConfirmationPolicyRepository;
  interpreter: MessageInterpreter;
  nextId: () => string;
}

export interface ProcessCaptureInput {
  workspaceId: string;
  externalMessageId: string;
  channel: CaptureChannel;
  message: string;
}

type PublicTransaction = Omit<TransactionRecord, "id" | "workspaceId" | "captureId" | "confidence"> & {
  confidence: number;
};

export type ProcessCaptureOutput =
  | {
      status: "registered" | "pending_confirmation";
      message: string;
      transaction: PublicTransaction;
      actions?: readonly ["confirm", "cancel"];
      duplicate: boolean;
    }
  | { status: "needs_information"; message: string; missingFields: string[]; duplicate: false };

export class ProcessCapture {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: ProcessCaptureInput): Promise<ProcessCaptureOutput> {
    const capture = await this.dependencies.captures.createOrGet({
      id: this.dependencies.nextId(),
      workspaceId: input.workspaceId,
      externalMessageId: input.externalMessageId,
      channel: input.channel,
      rawMessage: input.message,
      status: "received"
    });
    const existing = await this.dependencies.transactions.findByCaptureId(input.workspaceId, capture.id);
    if (existing) return this.success(existing, true);

    const interpretation = await this.dependencies.interpreter.interpret(input.message);
    if (interpretation.kind === "incomplete") {
      return {
        status: "needs_information",
        message: `No registré el gasto. Faltan: ${this.missingLabels(interpretation.missingFields)}.`,
        missingFields: interpretation.missingFields,
        duplicate: false
      };
    }

    const draft = ExpenseDraft.create({
      rawMessage: input.message,
      money: Money.fromDecimal(interpretation.amount, interpretation.currency),
      concept: interpretation.concept,
      paymentMethod: interpretation.paymentMethod,
      sourceChannel: input.channel,
      confidence: interpretation.confidence
    });
    const policyRecord = await this.dependencies.confirmationPolicies.findByWorkspaceAndChannel(input.workspaceId, input.channel);
    const policy = ConfirmationPolicy.create({
      channel: input.channel,
      mode: policyRecord?.mode ?? "always_confirm",
      confidenceThreshold: policyRecord?.confidenceThreshold === null || !policyRecord
        ? null
        : Number(policyRecord.confidenceThreshold)
    });
    const values = draft.toPrimitives();
    const saved = await this.dependencies.transactions.saveOrGet({
      id: this.dependencies.nextId(),
      workspaceId: input.workspaceId,
      captureId: capture.id,
      transactionType: "expense",
      amount: values.amount,
      currency: values.currency,
      concept: values.concept,
      paymentMethod: values.paymentMethod,
      status: policy.decide(values.confidence),
      confidence: values.confidence.toFixed(4)
    });
    return this.success(saved.transaction, !saved.created);
  }

  private success(record: TransactionRecord, duplicate: boolean): ProcessCaptureOutput {
    const amount = Number.parseInt(record.amount, 10).toLocaleString("es-CR").replaceAll(" ", ".");
    const paymentLabel = record.paymentMethod === "card" ? "Tarjeta" : record.paymentMethod;
    const pending = record.status === "pending_confirmation";
    return {
      status: record.status,
      message: duplicate
        ? `Este gasto ya estaba registrado: ₡${amount} ${record.currency} en ${record.concept} con ${paymentLabel}.`
        : pending
          ? `Interpreté un gasto de ₡${amount} ${record.currency} en ${record.concept} con ${paymentLabel}. ¿Querés registrarlo?`
          : `Gasto registrado: ₡${amount} ${record.currency} en ${record.concept} con ${paymentLabel}.`,
      ...(pending && !duplicate ? { actions: ["confirm", "cancel"] as const } : {}),
      transaction: {
        transactionType: record.transactionType,
        amount: record.amount,
        currency: record.currency,
        concept: record.concept,
        paymentMethod: record.paymentMethod,
        status: record.status,
        confidence: Number(record.confidence)
      },
      duplicate
    };
  }

  private missingLabels(fields: string[]): string {
    const labels: Record<string, string> = {
      transactionType: "tipo",
      amount: "monto",
      currency: "moneda",
      concept: "concepto",
      paymentMethod: "medio de pago"
    };
    const values = fields.map((field) => labels[field] ?? field);
    return values.length === 1 ? values[0]! : `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
  }
}
