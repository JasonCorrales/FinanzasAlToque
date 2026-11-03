import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Vercel entrypoint", () => {
  it("keeps Vercel compiler dependencies and APIs available", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const tsconfig = JSON.parse(await readFile("tsconfig.json", "utf8"));
    const typescript = await import("typescript");

    expect(packageJson.dependencies).toMatchObject({
      "@types/node": expect.any(String),
      "@types/pg": expect.any(String)
    });
    expect(packageJson.devDependencies.typescript).toBe("6.0.3");
    expect(tsconfig.compilerOptions.types).toEqual(["node"]);
    expect(typescript.sys?.readFile).toBeTypeOf("function");
    expect(typescript.createProgram).toBeTypeOf("function");
  });

  it("exports the Fastify app for Vercel Functions", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:password@db.example.com:6543/postgres");

    const { default: app } = await import("../../src/server.js");
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
