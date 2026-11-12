import type { AuthenticatedUserVerifier, WorkspaceMembershipRepository } from "./ports.js";

export class AuthenticatedWorkspaceAccessError extends Error {
  constructor() {
    super("authenticated workspace access was denied");
    this.name = "AuthenticatedWorkspaceAccessError";
  }
}

interface Dependencies {
  users: AuthenticatedUserVerifier;
  memberships: WorkspaceMembershipRepository;
}

export interface ResolveAuthenticatedWorkspaceInput {
  accessToken: string;
}

export interface AuthenticatedWorkspace {
  userId: string;
  workspaceId: string;
}

export class ResolveAuthenticatedWorkspace {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: ResolveAuthenticatedWorkspaceInput): Promise<AuthenticatedWorkspace> {
    const user = await this.dependencies.users.verify(input.accessToken);
    const workspaceIds = await this.dependencies.memberships.listWorkspaceIdsByAuthUserId(user.id);

    if (workspaceIds.length !== 1) throw new AuthenticatedWorkspaceAccessError();
    const workspaceId = workspaceIds[0];
    if (!workspaceId) throw new AuthenticatedWorkspaceAccessError();

    return { userId: user.id, workspaceId };
  }
}
