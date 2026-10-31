import { and, eq, sql } from "drizzle-orm";

import type {
  ConfirmationPolicyRecord,
  ConfirmationPolicyRepository
} from "../../application/ports.js";
import type { CaptureChannel } from "../../domain/transactions/expense-draft.js";
import { confirmationPolicies } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type PolicyInput = Omit<
  typeof confirmationPolicies.$inferInsert,
  "version" | "createdAt" | "updatedAt"
>;
type StoredPolicy = typeof confirmationPolicies.$inferSelect;

export class DrizzleConfirmationPolicyRepository implements ConfirmationPolicyRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async save(input: PolicyInput): Promise<StoredPolicy> {
    const [policy] = await this.db
      .insert(confirmationPolicies)
      .values(input)
      .onConflictDoUpdate({
        target: [confirmationPolicies.workspaceId, confirmationPolicies.channel],
        set: {
          mode: input.mode,
          confidenceThreshold: input.confidenceThreshold,
          version: sql`${confirmationPolicies.version} + 1`,
          updatedAt: new Date()
        }
      })
      .returning();

    if (!policy) throw new Error("confirmation policy was not persisted");
    return policy;
  }

  async findByWorkspaceAndChannel(
    workspaceId: string,
    channel: CaptureChannel
  ): Promise<ConfirmationPolicyRecord | null> {
    const [policy] = await this.db
      .select()
      .from(confirmationPolicies)
      .where(
        and(
          eq(confirmationPolicies.workspaceId, workspaceId),
          eq(confirmationPolicies.channel, channel)
        )
      )
      .limit(1);

    return policy ? this.toRecord(policy) : null;
  }

  private toRecord(row: StoredPolicy): ConfirmationPolicyRecord {
    if (
      row.channel !== "telegram" ||
      !["always_confirm", "confidence_based", "never_confirm"].includes(row.mode)
    ) {
      throw new Error("stored confirmation policy has an unsupported channel or mode");
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      channel: "telegram",
      mode: row.mode as ConfirmationPolicyRecord["mode"],
      confidenceThreshold: row.confidenceThreshold,
      version: row.version
    };
  }
}
