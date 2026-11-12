import { asc, eq } from "drizzle-orm";

import type { WorkspaceMembershipRepository } from "../../application/ports.js";
import { workspaceMemberships } from "../database/schema.js";
import type { FinanceDatabase } from "./database.js";

export class DrizzleWorkspaceMembershipRepository implements WorkspaceMembershipRepository {
  constructor(private readonly db: FinanceDatabase) {}

  async listWorkspaceIdsByAuthUserId(authUserId: string): Promise<string[]> {
    const memberships = await this.db
      .select({ workspaceId: workspaceMemberships.workspaceId })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.authUserId, authUserId))
      .orderBy(asc(workspaceMemberships.workspaceId));
    return memberships.map((membership) => membership.workspaceId);
  }
}
