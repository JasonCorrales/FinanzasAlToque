import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import type { ProcessCapture } from "../../src/application/process-capture.js";
import { buildApp } from "../../src/http-app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

const validPayload = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  externalMessageId: "telegram-error-500",
  channel: "telegram",
  message: "Gaste 15.000 colones en Gasolina pague con Tarjeta"
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("HTTP error handling", () => {
  it("sanitizes unexpected 5xx responses and logs the original failure with a correlation id", async () => {
    const secret = "Failed query: insert into transactions; parameters: super-secret";
    const logChunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      }
    });
    const processCapture = {
      async execute() {
        throw Object.assign(new Error(secret), { statusCode: 503 });
      }
    } as unknown as ProcessCapture;
    const app = buildApp({
      logger: { level: "error", stream },
      genReqId: () => "req-sanitized-500",
      processCapture
    });
    apps.push(app);

    const response = await app.inject({ method: "POST", url: "/v1/captures", payload: validPayload });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Ocurrió un error interno. Intentá nuevamente.",
      errorId: "req-sanitized-500"
    });
    expect(response.body).not.toContain(secret);
    expect(response.body).not.toContain("insert into transactions");
    expect(response.body).not.toContain("super-secret");
    expect(logChunks.join("\n")).toContain(secret);
    expect(logChunks.join("\n")).toContain("req-sanitized-500");
  });

  it("preserves existing public validation responses", async () => {
    const app = buildApp({ logger: false, processCapture: {} as ProcessCapture });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: { ...validPayload, workspaceId: "not-a-uuid" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      status: "rejected",
      message: "La captura no es válida."
    });
  });
});
