import { and, eq } from "drizzle-orm";

import { captures } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type CaptureInsert = typeof captures.$inferInsert;
type CaptureRecord = typeof captures.$inferSelect;

export class DrizzleCaptureRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async createOrGet(input: CaptureInsert): Promise<CaptureRecord> {
    const [created] = await this.db
      .insert(captures)
      .values(input)
      .onConflictDoNothing({
        target: [captures.workspaceId, captures.channel, captures.externalMessageId]
      })
      .returning();

    if (created) {
      return created;
    }

    const [existing] = await this.db
      .select()
      .from(captures)
      .where(
        and(
          eq(captures.workspaceId, input.workspaceId),
          eq(captures.channel, input.channel),
          eq(captures.externalMessageId, input.externalMessageId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new Error("capture conflict did not resolve to an existing record");
    }

    return existing;
  }

  async count(): Promise<number> {
    return this.db.$count(captures);
  }
}
