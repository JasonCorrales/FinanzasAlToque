import { STATUS_CODES } from "node:http";

import Fastify, { type FastifyServerOptions } from "fastify";
import { z } from "zod";

import {
  BankSmsAuthenticationError,
  BankSmsConfigurationError,
  BankSmsValidationError
} from "./application/bank-sms-errors.js";
import type { DecideTransaction } from "./application/decide-transaction.js";
import type { ProcessBankSmsCapture } from "./application/process-bank-sms-capture.js";
import type { ProcessCapture } from "./application/process-capture.js";

interface BuildAppOptions extends FastifyServerOptions {
  processCapture?: ProcessCapture;
  processBankSmsCapture?: ProcessBankSmsCapture;
  decideTransaction?: DecideTransaction;
}

const bankSmsCaptureSchema = z.object({
  eventId: z.string().min(1),
  sender: z.string().min(1),
  message: z.string().min(1),
  receivedAt: z.iso.datetime().optional()
}).strict();

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
  if (error instanceof BankSmsAuthenticationError) return 401;
  if (error instanceof BankSmsValidationError) return 422;
  if (error instanceof BankSmsConfigurationError) return 503;
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 500;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500
    ? statusCode
    : 500;
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof BankSmsAuthenticationError) return "No autorizado.";
  if (error instanceof BankSmsValidationError) return "La captura bancaria no coincide con la configuración.";
  if (error instanceof BankSmsConfigurationError) return "La captura bancaria no está disponible.";
  return error instanceof Error ? error.message : "Request failed";
}

function bankSmsToken(request: { raw: { rawHeaders: string[] } }): string | null {
  const values: string[] = [];
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === "authorization") {
      values.push(request.raw.rawHeaders[index + 1] ?? "");
    }
  }
  if (values.length !== 1) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{32,512})$/.exec(values[0] ?? "");
  return match?.[1] ?? null;
}

export function buildApp(options: BuildAppOptions = {}) {
  const { processCapture, processBankSmsCapture, decideTransaction, ...fastifyOptions } = options;
  const app = Fastify(fastifyOptions);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = publicErrorStatusCode(error);
    if (
      error instanceof BankSmsAuthenticationError
      || error instanceof BankSmsValidationError
      || error instanceof BankSmsConfigurationError
    ) {
      return reply.code(statusCode).send({ status: "rejected", message: publicErrorMessage(error) });
    }
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

  if (processBankSmsCapture) {
    app.post("/v1/bank-sms/captures", async (request, reply) => {
      const parsed = bankSmsCaptureSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ status: "rejected", message: "La captura bancaria no es válida." });
      }
      const token = bankSmsToken(request);
      if (!token) return reply.code(401).send({ status: "rejected", message: "No autorizado." });

      const outcome = await processBankSmsCapture.execute({
        token,
        eventId: parsed.data.eventId,
        sender: parsed.data.sender,
        message: parsed.data.message,
        receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date()
      });
      return reply.code(outcome.duplicate ? 200 : 201).send({
        status: outcome.status,
        duplicate: outcome.duplicate,
        transactionId: outcome.transactionId,
        transaction: {
          amount: outcome.transaction.amount,
          currency: outcome.transaction.currency,
          concept: outcome.transaction.concept,
          paymentMethod: outcome.transaction.paymentMethod
        }
      });
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
