import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/http-app.js";

describe("browser dashboard routes", () => {
  it("returns only the explicitly configured public Supabase client configuration", async () => {
    const app = buildApp({
      logger: false,
      dashboard: {
        clientConfig: {
          supabaseUrl: "https://project-ref.supabase.co",
          supabasePublishableKey: "sb_publishable_example"
        },
        assets: {
          indexHtml: "<main>Dashboard</main>",
          stylesCss: "body { color: navy; }",
          modules: {
            "/assets/main.js": "export const main = true;"
          }
        }
      }
    });

    const config = await app.inject({ method: "GET", url: "/v1/client-config" });
    expect(config.statusCode).toBe(200);
    expect(config.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(config.json()).toEqual({
      supabaseUrl: "https://project-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_example"
    });

    await app.close();
  });

  it("serves only the known same-origin browser assets with their exact content types", async () => {
    const app = buildApp({
      logger: false,
      dashboard: {
        assets: {
          indexHtml: "<main>Dashboard</main>",
          stylesCss: "body { color: navy; }",
          modules: {
            "/assets/main.js": "export const main = true;"
          }
        }
      }
    });

    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(index.body).toBe("<main>Dashboard</main>");

    const styles = await app.inject({ method: "GET", url: "/styles.css" });
    expect(styles.statusCode).toBe(200);
    expect(styles.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect(styles.body).toBe("body { color: navy; }");

    const module = await app.inject({ method: "GET", url: "/assets/main.js" });
    expect(module.statusCode).toBe(200);
    expect(module.headers["content-type"]).toBe("application/javascript; charset=utf-8");
    expect(module.body).toBe("export const main = true;");

    const traversal = await app.inject({ method: "GET", url: "/assets/%2e%2e/http-app.ts" });
    expect(traversal.statusCode).toBe(404);
    const unavailableConfig = await app.inject({ method: "GET", url: "/v1/client-config" });
    expect(unavailableConfig.statusCode).toBe(404);
    await app.close();
  });

  it("leaves the existing health route unchanged", async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
