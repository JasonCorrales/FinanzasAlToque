import type {
  RegisteredExpenseQueryInput,
  RegisteredExpenseQueryRepository,
  RegisteredExpenseQueryResult
} from "./ports.js";

export class QueryRegisteredExpenses {
  constructor(private readonly expenses: RegisteredExpenseQueryRepository) {}

  async execute(input: RegisteredExpenseQueryInput): Promise<RegisteredExpenseQueryResult> {
    this.validate(input);
    return this.expenses.queryRegisteredExpenses(input);
  }

  private validate(input: RegisteredExpenseQueryInput): void {
    if (
      !isValidDate(input.from)
      || !isValidDate(input.to)
      || input.from >= input.to
      || !Number.isInteger(input.limit)
      || input.limit < 1
      || input.limit > 100
      || !isCanonicalPaymentMethod(input.paymentMethod)
      || !isValidCursor(input.cursor)
    ) {
      throw new Error("Invalid registered expense query");
    }
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isCanonicalPaymentMethod(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0 && value === value.trim());
}

function isValidCursor(value: unknown): boolean {
  return value === undefined || (
    typeof value === "object"
    && value !== null
    && "createdAt" in value
    && "id" in value
    && isValidDate(value.createdAt)
    && typeof value.id === "string"
    && isUuid(value.id)
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
