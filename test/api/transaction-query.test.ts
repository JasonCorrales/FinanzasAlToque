import { describe, expect, it, vi } from "vitest";

import {
  AuthenticatedWorkspaceAccessError,
  AuthenticatedWorkspaceAuthenticationError,
  ResolveAuthenticatedWorkspace
} from "../../src/application/resolve-authenticated-workspace.js";
import { buildApp } from "../../src/http-app.js";
import { QueryRegisteredExpenses } from "../../src/application/query-registered-expenses.js";

const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature";
const workspaceId = "10000000-0000-4000-8000-000000000001";
const cursorId = "40000000-0000-4000-8000-000000000001";

function buildTransactionApp() {
  const resolveAuthenticatedWorkspace = {
    execute: vi.fn().mockResolvedValue({ userId: "supabase-user-id", workspaceId })
  };
  const queryRegisteredExpenses = {
    execute: vi.fn().mockResolvedValue({
      items: [{
        id: cursorId,
        amount: "1234.560000",
        currency: "CRC",
        concept: "Supermercado",
        paymentMethod: "card",
        createdAt: new Date("2025-01-15T12:00:00.000Z")
      }],
      totalCount: 1,
      totalsByCurrency: [{ currency: "CRC", amount: "1234.560000" }],
      nextCursor: { createdAt: new Date("2025-01-15T12:00:00.000Z"), id: cursorId }
    })
  };
  return {
    app: buildApp({
      logger: false,
      resolveAuthenticatedWorkspace: resolveAuthenticatedWorkspace as unknown as ResolveAuthenticatedWorkspace,
      queryRegisteredExpenses: queryRegisteredExpenses as unknown as QueryRegisteredExpenses
    }),
    resolveAuthenticatedWorkspace,
    queryRegisteredExpenses
  };
}

describe("GET /v1/transactions", () => {
  it("uses the authenticated workspace and returns privacy-safe decimal-string pagination", async () => {
    const { app, resolveAuthenticatedWorkspace, queryRegisteredExpenses } = buildTransactionApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z&paymentMethod=card&limit=20",
      headers: { authorization: `Bearer ${jwt}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [{
        id: cursorId,
        amount: "1234.560000",
        currency: "CRC",
        concept: "Supermercado",
        paymentMethod: "card",
        createdAt: "2025-01-15T12:00:00.000Z"
      }],
      totalCount: 1,
      totalsByCurrency: [{ currency: "CRC", amount: "1234.560000" }],
      nextCursor: "eyJ2IjoxLCJjcmVhdGVkQXQiOiIyMDI1LTAxLTE1VDEyOjAwOjAwLjAwMFoiLCJpZCI6IjQwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9"
    });
    expect(resolveAuthenticatedWorkspace.execute).toHaveBeenCalledWith({ accessToken: jwt });
    expect(queryRegisteredExpenses.execute).toHaveBeenCalledWith({
      workspaceId,
      from: new Date("2025-01-01T00:00:00.000Z"),
      to: new Date("2025-02-01T00:00:00.000Z"),
      paymentMethod: "card",
      limit: 20
    });
    await app.close();
  });

  it("decodes only a versioned opaque cursor", async () => {
    const { app, queryRegisteredExpenses } = buildTransactionApp();
    const cursor = "eyJ2IjoxLCJjcmVhdGVkQXQiOiIyMDI1LTAxLTE1VDEyOjAwOjAwLjAwMFoiLCJpZCI6IjQwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9";
    const response = await app.inject({
      method: "GET",
      url: `/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z&cursor=${cursor}`,
      headers: { authorization: `Bearer ${jwt}` }
    });

    expect(response.statusCode).toBe(200);
    expect(queryRegisteredExpenses.execute).toHaveBeenCalledWith(expect.objectContaining({
      cursor: { createdAt: new Date("2025-01-15T12:00:00.000Z"), id: cursorId }
    }));
    await app.close();
  });

  it.each([
    "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z",
    "/v1/transactions?from=invalid&to=2025-02-01T00%3A00%3A00.000Z",
    "/v1/transactions?from=2025-02-01T00%3A00%3A00.000Z&to=2025-01-01T00%3A00%3A00.000Z",
    "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z&limit=101",
    "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z&workspaceId=20000000-0000-4000-8000-000000000002",
    "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z&cursor=invalid"
  ])("rejects invalid query %s before authenticating or querying", async (url) => {
    const { app, resolveAuthenticatedWorkspace, queryRegisteredExpenses } = buildTransactionApp();

    const response = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${jwt}` } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ status: "rejected", message: "La consulta no es válida." });
    expect(resolveAuthenticatedWorkspace.execute).not.toHaveBeenCalled();
    expect(queryRegisteredExpenses.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([undefined, "Basic token", "Bearer not.a.jwt.extra"]) 
  ("rejects a missing or malformed Authorization header", async (authorization) => {
    const { app, queryRegisteredExpenses } = buildTransactionApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z",
      headers: authorization ? { authorization } : {}
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
    expect(queryRegisteredExpenses.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects duplicate Authorization headers", async () => {
    const { app, queryRegisteredExpenses } = buildTransactionApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z",
      headers: { authorization: [`Bearer ${jwt}`, `Bearer ${jwt}`] } as unknown as Record<string, string>
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ status: "rejected", message: "No autorizado." });
    expect(queryRegisteredExpenses.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it("maps verifier failures to 401 and membership failures to 403", async () => {
    const { app, resolveAuthenticatedWorkspace, queryRegisteredExpenses } = buildTransactionApp();
    resolveAuthenticatedWorkspace.execute.mockRejectedValueOnce(new AuthenticatedWorkspaceAuthenticationError());
    resolveAuthenticatedWorkspace.execute.mockRejectedValueOnce(new AuthenticatedWorkspaceAccessError());
    const request = {
      method: "GET" as const,
      url: "/v1/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2025-02-01T00%3A00%3A00.000Z",
      headers: { authorization: `Bearer ${jwt}` }
    };

    await expect(app.inject(request)).resolves.toMatchObject({ statusCode: 401 });
    await expect(app.inject(request)).resolves.toMatchObject({ statusCode: 403 });
    expect(queryRegisteredExpenses.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it("is absent unless both authenticated consultation dependencies are composed", async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({ method: "GET", url: "/v1/transactions" });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
