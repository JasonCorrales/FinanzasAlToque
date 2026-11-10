import { STATUS_CODES } from "node:http";

import Fastify, { type FastifyServerOptions } from "fastify";
import { z } from "zod";

import type { DecideTransaction } from "./application/decide-transaction.js";
import type { ProcessCapture } from "./application/process-capture.js";

interface BuildAppOptions extends FastifyServerOptions {
  processCapture?: ProcessCapture;
  decideTransaction?: DecideTransaction;
}

const captureSchema = z.object({
  workspaceId: z.string().uuid(),
  externalMessageId: z.string().min(1),
  channel: z.literal("telegram"),
  origin: z.enum(["text", "voice"]).optional(),
  message: z.string().min(1)
});

const decisionSchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(["confirm", "cancel"])
});

const transactionParamsSchema = z.object({ id: z.string().uuid() });

function publicErrorStatusCode(error: unknown): number {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 500;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500
    ? statusCode
    : 500;
}

function publicErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export function buildApp(options: BuildAppOptions = {}) {
  const { processCapture, decideTransaction, ...fastifyOptions } = options;
  const app = Fastify(fastifyOptions);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = publicErrorStatusCode(error);
    if (statusCode < 500) {
      return reply.code(statusCode).send({
        statusCode,
        error: STATUS_CODES[statusCode] ?? "Error",
        message: publicErrorMessage(error)
      });
    }

    const errorId = request.id;
    request.log.error({ err: error, errorId }, "Unhandled request error");
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Ocurrió un error interno. Intentá nuevamente.",
      errorId
    });
  });

  app.get("/health", async () => ({ status: "ok" as const }));

  if (processCapture) {
    app.post("/v1/captures", async (request, reply) => {
      const parsed = captureSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ status: "rejected", message: "La captura no es válida." });
      }
      const outcome = await processCapture.execute(parsed.data);
      const statusCode = outcome.status === "needs_information" ? 422 : outcome.duplicate ? 200 : 201;
      const { duplicate, ...rest } = outcome;
      const body = duplicate ? { ...rest, duplicate: true } : rest;
      return reply.code(statusCode).send(body);
    });
  }

  if (decideTransaction) {
    app.post("/v1/transactions/:id/decision", async (request, reply) => {
      const params = transactionParamsSchema.safeParse(request.params);
      const body = decisionSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ status: "rejected", message: "La decisión no es válida." });
      }

      const outcome = await decideTransaction.execute({
        workspaceId: body.data.workspaceId,
        transactionId: params.data.id,
        action: body.data.action
      });
      if (outcome.status === "rejected") {
        const { reason, ...publicOutcome } = outcome;
        return reply.code(reason === "not_found" ? 404 : 409).send(publicOutcome);
      }
      return reply.code(200).send(outcome);
    });
  }

  return app;
}
