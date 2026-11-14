import { describe, expect, it, vi } from "vitest";

import {
  createAuthController,
  loadClientConfig,
  type AuthView,
  type BrowserDependencies
} from "../../web/auth.js";

const config = {
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "publishable-key"
};

function response(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 401,
    headers: { "content-type": "application/json" }
  });
}

function dependencies(overrides: Partial<BrowserDependencies> = {}): BrowserDependencies {
  const values = new Map<string, string>();
  return {
    fetch: vi.fn(async () => response(config)),
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    ...overrides
  };
}

function view(): AuthView & { states: string[]; errors: string[] } {
  const states: string[] = [];
  const errors: string[] = [];
  return {
    states,
    errors,
    showLogin: () => states.push("login"),
    showAuthenticated: () => states.push("authenticated"),
    showLoading: () => states.push("loading"),
    showError: (message) => errors.push(message)
  };
}

describe("browser authentication", () => {
  it("loads only valid same-origin public configuration without storing malformed data", async () => {
    const browser = dependencies({ fetch: vi.fn(async () => response({ supabaseUrl: "not-a-url" })) });

    await expect(loadClientConfig(browser)).rejects.toThrow("Invalid client configuration");
    expect(browser.fetch).toHaveBeenCalledWith("/v1/client-config", { headers: { accept: "application/json" } });
    expect(browser.sessionStorage.getItem("finanzas.access-token")).toBeNull();
  });

  it("posts credentials to Supabase, stores only the access token, and masks provider errors in Spanish", async () => {
    const browser = dependencies({
      fetch: vi.fn()
        .mockResolvedValueOnce(response(config))
        .mockResolvedValueOnce(response({ access_token: "access-token", refresh_token: "do-not-store" }))
    });
    const ui = view();
    const auth = createAuthController(browser, ui);

    await auth.signIn("ana@example.com", "secret-password");

    expect(browser.fetch).toHaveBeenLastCalledWith(
      "https://project.supabase.co/auth/v1/token?grant_type=password",
      expect.objectContaining({
        method: "POST",
        headers: { apikey: "publishable-key", "content-type": "application/json" },
        body: JSON.stringify({ email: "ana@example.com", password: "secret-password" })
      })
    );
    expect(browser.sessionStorage.getItem("finanzas.access-token")).toBe("access-token");
    expect(browser.sessionStorage.getItem("refresh_token")).toBeNull();

    const rejected = dependencies({
      fetch: vi.fn()
        .mockResolvedValueOnce(response(config))
        .mockResolvedValueOnce(response({ message: "provider diagnostic" }, false))
    });
    const rejectedUi = view();
    await expect(createAuthController(rejected, rejectedUi).signIn("ana@example.com", "wrong")).rejects.toThrow(
      "No pudimos iniciar sesión. Verificá tu correo y contraseña e intentá nuevamente."
    );
    expect(rejectedUi.errors).toEqual(["No pudimos iniciar sesión. Verificá tu correo y contraseña e intentá nuevamente."]);
  });

  it("restores an existing session and clears it on explicit sign-out", async () => {
    const browser = dependencies();
    browser.sessionStorage.setItem("finanzas.access-token", "saved-token");
    const ui = view();
    const auth = createAuthController(browser, ui);

    auth.restoreSession();
    auth.signOut();

    expect(ui.states).toEqual(["authenticated", "login"]);
    expect(browser.sessionStorage.getItem("finanzas.access-token")).toBeNull();
  });

  it("starts unauthenticated with a login-only view and exposes loading feedback during sign-in", async () => {
    const browser = dependencies({
      fetch: vi.fn().mockResolvedValueOnce(response(config)).mockResolvedValueOnce(response({ access_token: "token" }))
    });
    const ui = view();
    const auth = createAuthController(browser, ui);

    auth.restoreSession();
    await auth.signIn("ana@example.com", "secret-password");

    expect(ui.states).toEqual(["login", "loading", "authenticated"]);
  });
});
