import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { buildProductionApp } from "../../src/bootstrap.js";
import * as schema from "../../src/infrastructure/database/schema.js";

const clients: PGlite[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("dashboard production composition", () => {
  it("fails fast with stable errors when production dashboard configuration is absent or malformed", async () => {
    const client = new PGlite();
    clients.push(client);
    const db = drizzle(client, { schema });

    expect(() => buildProductionApp(db, {
      logger: false,
      environment: { NODE_ENV: "production" }
    })).toThrow("SUPABASE_URL is required for dashboard production");

    expect(() => buildProductionApp(db, {
      logger: false,
      environment: {
        NODE_ENV: "production",
        SUPABASE_URL: "https://project-ref.supabase.co"
      }
    })).toThrow("SUPABASE_PUBLISHABLE_KEY is required for dashboard production");

    expect(() => buildProductionApp(db, {
      logger: false,
      environment: {
        NODE_ENV: "production",
        SUPABASE_URL: "http://project-ref.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example"
      }
    })).toThrow("SUPABASE_URL must be an HTTPS Supabase project URL for dashboard production");
  });

  it("loads the built public assets for same-origin production delivery", async () => {
    const client = new PGlite();
    clients.push(client);
    const db = drizzle(client, { schema });
    const expectedIndex = await readFile("public/index.html", "utf8");
    const app = buildProductionApp(db, {
      logger: false,
      environment: {
        NODE_ENV: "production",
        SUPABASE_URL: "https://project-ref.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example"
      }
    });

    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(index.body).toBe(expectedIndex);

    const config = await app.inject({ method: "GET", url: "/v1/client-config" });
    expect(config.statusCode).toBe(200);
    expect(config.json()).toEqual({
      supabaseUrl: "https://project-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_example"
    });
    await app.close();
  });
});
