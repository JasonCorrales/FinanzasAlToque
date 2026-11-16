import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Vercel entrypoint", () => {
  it("exposes an api-directory entrypoint that directly imports Fastify", async () => {
    const apiFiles = await readdir("api");
    const sourceFiles = await readdir("src");
    const serverSource = await readFile("api/server.ts", "utf8");

    expect(apiFiles).toEqual(["server.ts"]);
    expect(sourceFiles).not.toContain("server.ts");
    expect(sourceFiles).not.toContain("app.ts");
    expect(sourceFiles).not.toContain("index.ts");
    expect(serverSource).toMatch(/(?:from|require|import)\s*(?:\(\s*)?["']fastify["']/);
    expect(serverSource).toContain("app.listen({ port: 3000 });");
    expect(serverSource).not.toMatch(/await\s+app\.listen/);
    expect(serverSource).not.toMatch(/export\s+default/);
  });

  it("bundles only the public dashboard assets with the Fastify entrypoint and keeps API routes unshadowed", async () => {
    const vercel = JSON.parse(await readFile("vercel.json", "utf8"));

    expect(vercel).toEqual({
      functions: {
        "api/server.ts": { includeFiles: "public/**" }
      }
    });
    expect(vercel).not.toHaveProperty("rewrites");
  });

  it("builds and checks the browser alongside the backend while preserving the start flow", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));

    expect(packageJson.scripts.build).toBe("tsc -p tsconfig.build.json && npm run web:build");
    expect(packageJson.scripts.check).toBe("npm run typecheck && npm run web:build && npm test && npm run build");
    expect(packageJson.scripts.start).toBe("node dist/main.js");

    const tsconfig = JSON.parse(await readFile("tsconfig.json", "utf8"));
    expect(tsconfig.include).toContain("api");
  });

  it("documents dashboard login, public configuration, Vercel delivery, and date semantics", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(readme).toContain("service-role");
    expect(readme).toContain("/v1/client-config");
    expect(readme).toContain("registration-time");
    expect(readme).toContain("Vercel");
  });

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
});
