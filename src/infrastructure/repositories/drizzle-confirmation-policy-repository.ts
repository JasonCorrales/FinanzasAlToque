import { and, eq, sql } from "drizzle-orm";

import { confirmationPolicies } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type PolicyInput = Omit<
  typeof confirmationPolicies.$inferInsert,
  "version" | "createdAt" | "updatedAt"
>;
type PolicyRecord = typeof confirmationPolicies.$inferSelect;

export class DrizzleConfirmationPolicyRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async save(input: PolicyInput): Promise<PolicyRecord> {
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

    if (!policy) {
      throw new Error("confirmation policy was not persisted");
    }

    return policy;
  }

  async findByWorkspaceAndChannel(
    workspaceId: string,
    channel: string
  ): Promise<PolicyRecord | null> {
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

    return policy ?? null;
  }
}
