import { and, eq } from "drizzle-orm";

import type {
  PaymentMethodCatalogRepository,
  PaymentMethodRecord
} from "../../application/ports.js";
import { paymentMethods } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

export class DrizzlePaymentMethodCatalogRepository implements PaymentMethodCatalogRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async findEnabled(workspaceId: string, codeOrLabel: string): Promise<PaymentMethodRecord | null> {
    const methods = await this.db
      .select({
        workspaceId: paymentMethods.workspaceId,
        code: paymentMethods.code,
        label: paymentMethods.label,
        enabled: paymentMethods.enabled
      })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.workspaceId, workspaceId), eq(paymentMethods.enabled, true)));

    const normalized = normalize(codeOrLabel);
    const matches = methods.filter((method) =>
      [method.code, method.label].some((value) => normalize(value) === normalized)
    );

    return matches.length === 1 ? matches[0]! : null;
  }
}
