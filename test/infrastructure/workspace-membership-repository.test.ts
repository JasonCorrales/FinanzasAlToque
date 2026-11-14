import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";
import { DrizzleWorkspaceMembershipRepository } from "../../src/infrastructure/repositories/drizzle-workspace-membership-repository.js";

let client: PGlite;
let db: PgliteDatabase<typeof schema>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await applyMigrations(client);
});

afterEach(async () => {
  await client.close();
});

describe("DrizzleWorkspaceMembershipRepository", () => {
  it("lists only workspace IDs belonging to the Supabase auth user", async () => {
    const repository = new DrizzleWorkspaceMembershipRepository(db);
    const authUserId = "11111111-1111-4111-8111-111111111111";
    const workspaceId = "10000000-0000-4000-8000-000000000001";

    await db.insert(schema.workspaceMemberships).values([
      { authUserId, workspaceId },
      {
        authUserId: "22222222-2222-4222-8222-222222222222",
        workspaceId: "10000000-0000-4000-8000-000000000002"
      }
    ]);

    await expect(repository.listWorkspaceIdsByAuthUserId(authUserId)).resolves.toEqual([workspaceId]);
    await expect(
      repository.listWorkspaceIdsByAuthUserId("33333333-3333-4333-8333-333333333333")
    ).resolves.toEqual([]);
  });

  it("allows multiple workspace memberships so the application can deny ambiguous personal access", async () => {
    const authUserId = "11111111-1111-4111-8111-111111111111";
    await db.insert(schema.workspaceMemberships).values([
      { authUserId, workspaceId: "10000000-0000-4000-8000-000000000001" },
      { authUserId, workspaceId: "10000000-0000-4000-8000-000000000002" }
    ]);

    const repository = new DrizzleWorkspaceMembershipRepository(db);
    await expect(repository.listWorkspaceIdsByAuthUserId(authUserId)).resolves.toEqual([
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002"
    ]);
  });

  it("replays the membership migration without changing existing memberships", async () => {
    const membership = {
      authUserId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "10000000-0000-4000-8000-000000000001"
    };
    await db.insert(schema.workspaceMemberships).values(membership);

    await applyMigrations(client);

    const repository = new DrizzleWorkspaceMembershipRepository(db);
    await expect(repository.listWorkspaceIdsByAuthUserId(membership.authUserId)).resolves.toEqual([
      membership.workspaceId
    ]);
  });
});
