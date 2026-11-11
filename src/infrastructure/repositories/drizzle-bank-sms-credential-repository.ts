import { and, eq } from "drizzle-orm";

import type {
  ActiveBankSmsDeviceCredential,
  BankSmsCredentialRepository,
  BankSmsDeviceCredentialRecord,
  CreateBankSmsDeviceCredential
} from "../../application/ports.js";
import { bankSmsDeviceCredentials } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

type StoredCredential = typeof bankSmsDeviceCredentials.$inferSelect;

export class DrizzleBankSmsCredentialRepository implements BankSmsCredentialRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async create(input: CreateBankSmsDeviceCredential): Promise<BankSmsDeviceCredentialRecord> {
    const [credential] = await this.db.insert(bankSmsDeviceCredentials).values(input).returning();
    if (!credential) throw new Error("bank SMS credential was not persisted");
    return this.toRecord(credential);
  }

  async listByWorkspace(workspaceId: string): Promise<BankSmsDeviceCredentialRecord[]> {
    const credentials = await this.db
      .select({
        id: bankSmsDeviceCredentials.id,
        workspaceId: bankSmsDeviceCredentials.workspaceId,
        deviceLabel: bankSmsDeviceCredentials.deviceLabel,
        active: bankSmsDeviceCredentials.active,
        createdAt: bankSmsDeviceCredentials.createdAt,
        updatedAt: bankSmsDeviceCredentials.updatedAt,
        lastUsedAt: bankSmsDeviceCredentials.lastUsedAt,
        revokedAt: bankSmsDeviceCredentials.revokedAt
      })
      .from(bankSmsDeviceCredentials)
      .where(eq(bankSmsDeviceCredentials.workspaceId, workspaceId));
    return credentials;
  }

  async findActiveByTokenHash(tokenHash: string): Promise<ActiveBankSmsDeviceCredential | null> {
    const [credential] = await this.db
      .select()
      .from(bankSmsDeviceCredentials)
      .where(
        and(eq(bankSmsDeviceCredentials.tokenHash, tokenHash), eq(bankSmsDeviceCredentials.active, true))
      )
      .limit(1);
    return credential ? this.toRecord(credential) : null;
  }

  async touchLastUsed(
    workspaceId: string,
    credentialId: string
  ): Promise<BankSmsDeviceCredentialRecord | null> {
    const [credential] = await this.db
      .update(bankSmsDeviceCredentials)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(bankSmsDeviceCredentials.workspaceId, workspaceId),
          eq(bankSmsDeviceCredentials.id, credentialId),
          eq(bankSmsDeviceCredentials.active, true)
        )
      )
      .returning();
    return credential ? this.toRecord(credential) : null;
  }

  async revoke(
    workspaceId: string,
    credentialId: string
  ): Promise<BankSmsDeviceCredentialRecord | null> {
    const now = new Date();
    const [credential] = await this.db
      .update(bankSmsDeviceCredentials)
      .set({ active: false, revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(bankSmsDeviceCredentials.workspaceId, workspaceId),
          eq(bankSmsDeviceCredentials.id, credentialId),
          eq(bankSmsDeviceCredentials.active, true)
        )
      )
      .returning();
    return credential ? this.toRecord(credential) : null;
  }

  async rotate(
    workspaceId: string,
    credentialId: string,
    input: Omit<CreateBankSmsDeviceCredential, "workspaceId">
  ): Promise<BankSmsDeviceCredentialRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [revoked] = await tx
        .update(bankSmsDeviceCredentials)
        .set({ active: false, revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(bankSmsDeviceCredentials.workspaceId, workspaceId),
            eq(bankSmsDeviceCredentials.id, credentialId),
            eq(bankSmsDeviceCredentials.active, true)
          )
        )
        .returning({ id: bankSmsDeviceCredentials.id });
      if (!revoked) return null;

      const [created] = await tx
        .insert(bankSmsDeviceCredentials)
        .values({ workspaceId, ...input })
        .returning();
      if (!created) throw new Error("rotated bank SMS credential was not persisted");
      return this.toRecord(created);
    });
  }

  private toRecord(row: StoredCredential): BankSmsDeviceCredentialRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      deviceLabel: row.deviceLabel,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt
    };
  }
}
