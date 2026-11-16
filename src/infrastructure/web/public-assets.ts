import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ClientConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export interface DashboardAssets {
  indexHtml: string;
  stylesCss: string;
  modules: Readonly<Record<string, string>>;
}

export interface DashboardRuntime {
  assets: DashboardAssets;
  clientConfig?: ClientConfig;
}

export interface DashboardEnvironment {
  NODE_ENV?: string;
  VERCEL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

const publicDirectory = fileURLToPath(new URL("../../../public/", import.meta.url));
const modulePaths = ["auth.js", "dashboard.js", "main.js"] as const;

function isProduction(environment: DashboardEnvironment): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL === "1";
}

function configurationError(message: string, required: boolean): ClientConfig | undefined {
  if (required) throw new Error(message);
  return undefined;
}

export function resolveClientConfig(environment: DashboardEnvironment = process.env): ClientConfig | undefined {
  const required = isProduction(environment);
  const supabaseUrl = environment.SUPABASE_URL?.trim();
  const supabasePublishableKey = environment.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl) return configurationError("SUPABASE_URL is required for dashboard production", required);
  if (!supabasePublishableKey) return configurationError("SUPABASE_PUBLISHABLE_KEY is required for dashboard production", required);

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return configurationError("SUPABASE_URL must be an HTTPS Supabase project URL for dashboard production", required);
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    return configurationError("SUPABASE_URL must be an HTTPS Supabase project URL for dashboard production", required);
  }

  return { supabaseUrl: url.origin, supabasePublishableKey };
}

export function loadDashboardAssets(): DashboardAssets {
  const modules: Record<string, string> = {};
  for (const file of modulePaths) {
    modules[`/assets/${file}`] = readFileSync(`${publicDirectory}assets/${file}`, "utf8");
  }

  return {
    indexHtml: readFileSync(`${publicDirectory}index.html`, "utf8"),
    stylesCss: readFileSync(`${publicDirectory}styles.css`, "utf8"),
    modules
  };
}

export function loadDashboardRuntime(environment: DashboardEnvironment = process.env): DashboardRuntime {
  const clientConfig = resolveClientConfig(environment);
  return clientConfig ? { assets: loadDashboardAssets(), clientConfig } : { assets: loadDashboardAssets() };
}
