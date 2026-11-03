import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Vercel entrypoint", () => {
  it("exposes an unshadowed entrypoint that directly imports Fastify", async () => {
    const sourceFiles = await readdir("src");
    const serverSource = await readFile("src/server.ts", "utf8");

    expect(sourceFiles).toContain("server.ts");
    expect(sourceFiles).not.toContain("app.ts");
    expect(sourceFiles).not.toContain("index.ts");
    expect(serverSource).toMatch(/(?:from|require|import)\s*(?:\(\s*)?["']fastify["']/);
    expect(serverSource).toMatch(/\.listen\s*\(/);
    expect(serverSource).not.toMatch(/export\s+default/);
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
