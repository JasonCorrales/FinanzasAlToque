import { and, eq } from "drizzle-orm";

import type {
  CaptureRecord,
  CaptureRepository
} from "../../application/ports.js";
import { captures } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredCapture = typeof captures.$inferSelect;

export class DrizzleCaptureRepository implements CaptureRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async createOrGet(input: CaptureRecord): Promise<CaptureRecord> {
    const [created] = await this.db
      .insert(captures)
      .values(input)
      .onConflictDoNothing({
        target: [captures.workspaceId, captures.channel, captures.externalMessageId]
      })
      .returning();

    if (created) return this.toRecord(created);

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

    return this.toRecord(existing);
  }

  async count(): Promise<number> {
    return this.db.$count(captures);
  }

  private toRecord(row: StoredCapture): CaptureRecord {
    if (
      row.channel !== "telegram" ||
      !["received", "processed", "rejected"].includes(row.status)
    ) {
      throw new Error("stored capture has an unsupported channel or status");
    }
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      externalMessageId: row.externalMessageId,
      channel: row.channel,
      rawMessage: row.rawMessage,
      status: row.status as CaptureRecord["status"]
    };
  }
}
