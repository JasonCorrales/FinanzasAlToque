export interface ClientConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserDependencies {
  fetch: typeof fetch;
  sessionStorage: SessionStorageLike;
}

export interface AuthView {
  showLogin(): void;
  showAuthenticated(): void;
  showLoading(): void;
  showError(message: string): void;
}

const accessTokenKey = "finanzas.access-token";
const signInError = "No pudimos iniciar sesión. Verificá tu correo y contraseña e intentá nuevamente.";

function isClientConfig(value: unknown): value is ClientConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  if (typeof config.supabaseUrl !== "string" || typeof config.supabasePublishableKey !== "string") return false;
  if (config.supabasePublishableKey.trim() === "") return false;

  try {
    const url = new URL(config.supabaseUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function loadClientConfig(browser: Pick<BrowserDependencies, "fetch">): Promise<ClientConfig> {
  const response = await browser.fetch("/v1/client-config", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Client configuration is unavailable");
  const config: unknown = await response.json();
  if (!isClientConfig(config)) throw new Error("Invalid client configuration");
  return config;
}

export function createAuthController(browser: BrowserDependencies, view: AuthView) {
  return {
    restoreSession() {
      if (browser.sessionStorage.getItem(accessTokenKey)) view.showAuthenticated();
      else view.showLogin();
    },

    async signIn(email: string, password: string) {
      view.showLoading();
      try {
        const config = await loadClientConfig(browser);
        const response = await browser.fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: {
            apikey: config.supabasePublishableKey,
            "content-type": "application/json"
          },
          body: JSON.stringify({ email, password })
        });
        const payload: unknown = await response.json();
        if (!response.ok || typeof payload !== "object" || payload === null || typeof (payload as { access_token?: unknown }).access_token !== "string") {
          throw new Error(signInError);
        }
        browser.sessionStorage.setItem(accessTokenKey, (payload as { access_token: string }).access_token);
        view.showAuthenticated();
      } catch {
        view.showError(signInError);
        throw new Error(signInError);
      }
    },

    signOut() {
      browser.sessionStorage.removeItem(accessTokenKey);
      view.showLogin();
    }
  };
}
