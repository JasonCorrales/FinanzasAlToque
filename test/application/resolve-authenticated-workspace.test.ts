import { describe, expect, it, vi } from "vitest";

import {
  AuthenticatedWorkspaceAccessError,
  ResolveAuthenticatedWorkspace
} from "../../src/application/resolve-authenticated-workspace.js";

describe("ResolveAuthenticatedWorkspace", () => {
  it("resolves the sole database-backed workspace membership for a verified user", async () => {
    const verify = vi.fn().mockResolvedValue({ id: "supabase-user-id" });
    const listWorkspaceIdsByAuthUserId = vi
      .fn()
      .mockResolvedValue(["10000000-0000-4000-8000-000000000001"]);
    const resolver = new ResolveAuthenticatedWorkspace({
      users: { verify },
      memberships: { listWorkspaceIdsByAuthUserId }
    });

    await expect(resolver.execute({ accessToken: "access-token" })).resolves.toEqual({
      userId: "supabase-user-id",
      workspaceId: "10000000-0000-4000-8000-000000000001"
    });
    expect(verify).toHaveBeenCalledWith("access-token");
    expect(listWorkspaceIdsByAuthUserId).toHaveBeenCalledWith("supabase-user-id");
  });

  it.each([
    ["no membership", []],
    [
      "multiple memberships",
      [
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000002"
      ]
    ]
  ])("denies access when the user has %s", async (_caseName, memberships) => {
    const resolver = new ResolveAuthenticatedWorkspace({
      users: { verify: vi.fn().mockResolvedValue({ id: "supabase-user-id" }) },
      memberships: { listWorkspaceIdsByAuthUserId: vi.fn().mockResolvedValue(memberships) }
    });

    await expect(resolver.execute({ accessToken: "access-token" })).rejects.toBeInstanceOf(
      AuthenticatedWorkspaceAccessError
    );
  });
});
