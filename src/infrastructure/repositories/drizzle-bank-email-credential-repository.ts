import { and, eq } from "drizzle-orm";

import type {
  BankEmailAdapterCredentialRecord,
  BankEmailCredentialRepository,
  CreateBankEmailAdapterCredential
} from "../../application/ports.js";
import { bankEmailAdapterCredentials } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredCredential = typeof bankEmailAdapterCredentials.$inferSelect;

export class DrizzleBankEmailCredentialRepository implements BankEmailCredentialRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async create(input: CreateBankEmailAdapterCredential): Promise<BankEmailAdapterCredentialRecord> {
    const [credential] = await this.db.insert(bankEmailAdapterCredentials).values(input).returning();
    if (!credential) throw new Error("bank email credential was not persisted");
    return this.toRecord(credential);
  }

  async listByWorkspace(workspaceId: string): Promise<BankEmailAdapterCredentialRecord[]> {
    return this.db
      .select({
        id: bankEmailAdapterCredentials.id,
        workspaceId: bankEmailAdapterCredentials.workspaceId,
        adapter: bankEmailAdapterCredentials.adapter,
        active: bankEmailAdapterCredentials.active,
        createdAt: bankEmailAdapterCredentials.createdAt,
        updatedAt: bankEmailAdapterCredentials.updatedAt,
        lastUsedAt: bankEmailAdapterCredentials.lastUsedAt,
        revokedAt: bankEmailAdapterCredentials.revokedAt
      })
      .from(bankEmailAdapterCredentials)
      .where(eq(bankEmailAdapterCredentials.workspaceId, workspaceId));
  }

  async findActiveByTokenHash(tokenHash: string): Promise<BankEmailAdapterCredentialRecord | null> {
    const [credential] = await this.db
      .select()
      .from(bankEmailAdapterCredentials)
      .where(
        and(
          eq(bankEmailAdapterCredentials.tokenHash, tokenHash),
          eq(bankEmailAdapterCredentials.active, true)
        )
      )
      .limit(1);
    return credential ? this.toRecord(credential) : null;
  }

  async touchLastUsed(
    workspaceId: string,
    credentialId: string
  ): Promise<BankEmailAdapterCredentialRecord | null> {
    const [credential] = await this.db
      .update(bankEmailAdapterCredentials)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(bankEmailAdapterCredentials.workspaceId, workspaceId),
          eq(bankEmailAdapterCredentials.id, credentialId),
          eq(bankEmailAdapterCredentials.active, true)
        )
      )
      .returning();
    return credential ? this.toRecord(credential) : null;
  }

  async revoke(
    workspaceId: string,
    credentialId: string
  ): Promise<BankEmailAdapterCredentialRecord | null> {
    const now = new Date();
    const [credential] = await this.db
      .update(bankEmailAdapterCredentials)
      .set({ active: false, revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(bankEmailAdapterCredentials.workspaceId, workspaceId),
          eq(bankEmailAdapterCredentials.id, credentialId),
          eq(bankEmailAdapterCredentials.active, true)
        )
      )
      .returning();
    return credential ? this.toRecord(credential) : null;
  }

  async rotate(
    workspaceId: string,
    credentialId: string,
    input: Omit<CreateBankEmailAdapterCredential, "workspaceId">
  ): Promise<BankEmailAdapterCredentialRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [revoked] = await tx
        .update(bankEmailAdapterCredentials)
        .set({ active: false, revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(bankEmailAdapterCredentials.workspaceId, workspaceId),
            eq(bankEmailAdapterCredentials.id, credentialId),
            eq(bankEmailAdapterCredentials.active, true)
          )
        )
        .returning({ id: bankEmailAdapterCredentials.id });
      if (!revoked) return null;

      const [created] = await tx
        .insert(bankEmailAdapterCredentials)
        .values({ workspaceId, ...input })
        .returning();
      if (!created) throw new Error("rotated bank email credential was not persisted");
      return this.toRecord(created);
    });
  }

  private toRecord(row: StoredCredential): BankEmailAdapterCredentialRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      adapter: row.adapter,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt
    };
  }
}
