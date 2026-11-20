import { STATUS_CODES } from "node:http";

import Fastify, { type FastifyServerOptions } from "fastify";
import { z } from "zod";

import {
  BankSmsAuthenticationError,
  BankSmsConfigurationError,
  BankSmsValidationError
} from "./application/bank-sms-errors.js";
import type { DecideTransaction } from "./application/decide-transaction.js";
import {
  BankEmailAuthenticationError,
  BankEmailConfigurationError,
  BankEmailValidationError,
  type ProcessBankEmailCapture
} from "./application/process-bank-email-capture.js";
import type { ProcessBankSmsCapture } from "./application/process-bank-sms-capture.js";
import type { ProcessCapture } from "./application/process-capture.js";
import {
  QueryRegisteredExpenses,
  RegisteredExpenseQueryValidationError
} from "./application/query-registered-expenses.js";
import {
  AuthenticatedWorkspaceAccessError,
  AuthenticatedWorkspaceAuthenticationError,
  ResolveAuthenticatedWorkspace
} from "./application/resolve-authenticated-workspace.js";
import type { DashboardRuntime } from "./infrastructure/web/public-assets.js";

interface BuildAppOptions extends FastifyServerOptions {
  processCapture?: ProcessCapture;
  processBankSmsCapture?: ProcessBankSmsCapture;
  processBankEmailCapture?: ProcessBankEmailCapture;
  decideTransaction?: DecideTransaction;
  resolveAuthenticatedWorkspace?: ResolveAuthenticatedWorkspace;
  queryRegisteredExpenses?: QueryRegisteredExpenses;
  dashboard?: DashboardRuntime;
}

const bankSmsCaptureSchema = z.object({
  eventId: z.string().min(1),
  sender: z.string().min(1),
  message: z.string().min(1),
  receivedAt: z.iso.datetime().optional()
}).strict();

const authenticationResultSchema = z.string().max(9).pipe(z.enum([
  "pass", "fail", "softfail", "neutral", "none", "temperror", "permerror"
]));

const bankEmailCaptureSchema = z.object({
  eventId: z.string().min(1).max(512),
  sender: z.string().min(1).max(320),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(65_536),
  receivedAt: z.iso.datetime(),
  authentication: z.object({
    spf: authenticationResultSchema,
    dkim: authenticationResultSchema,
    dmarc: authenticationResultSchema,
    domain: z.string().min(1).max(253)
  }).strict()
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

const transactionQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  paymentMethod: z.string().min(1).refine((value) => value === value.trim()).optional(),
  limit: z.string().regex(/^(?:[1-9][0-9]?|100)$/).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).optional()
}).strict();

const cursorPayloadSchema = z.object({
  v: z.literal(1),
  createdAt: z.iso.datetime(),
  id: z.string().uuid()
}).strict();

function publicErrorStatusCode(error: unknown): number {
  if (
    error instanceof BankSmsAuthenticationError
    || error instanceof BankEmailAuthenticationError
    || error instanceof AuthenticatedWorkspaceAuthenticationError
  ) return 401;
  if (error instanceof AuthenticatedWorkspaceAccessError) return 403;
  if (error instanceof RegisteredExpenseQueryValidationError) return 400;
  if (error instanceof BankSmsValidationError || error instanceof BankEmailValidationError) return 422;
  if (error instanceof BankSmsConfigurationError || error instanceof BankEmailConfigurationError) return 503;
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 500;
  const statusCode = error.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500
    ? statusCode
    : 500;
}

function publicErrorMessage(error: unknown): string {
  if (
    error instanceof BankSmsAuthenticationError
    || error instanceof BankEmailAuthenticationError
    || error instanceof AuthenticatedWorkspaceAuthenticationError
  ) return "No autorizado.";
  if (error instanceof AuthenticatedWorkspaceAccessError) return "Acceso denegado.";
  if (error instanceof RegisteredExpenseQueryValidationError) return "La consulta no es válida.";
  if (error instanceof BankSmsValidationError || error instanceof BankEmailValidationError) return "La captura bancaria no coincide con la configuración.";
  if (error instanceof BankSmsConfigurationError || error instanceof BankEmailConfigurationError) return "La captura bancaria no está disponible.";
  return error instanceof Error ? error.message : "Request failed";
}

function normalizeAuthenticationResult(result: "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror"): "pass" | "fail" {
  return result === "pass" ? "pass" : "fail";
}

function bankBearerToken(
  request: { raw: { rawHeaders: string[] } },
  caseInsensitiveScheme = false
): string | null {
  const values: string[] = [];
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === "authorization") {
      values.push(request.raw.rawHeaders[index + 1] ?? "");
    }
  }
  if (values.length !== 1) return null;
  const pattern = caseInsensitiveScheme
    ? /^Bearer ([A-Za-z0-9_-]{32,512})$/i
    : /^Bearer ([A-Za-z0-9_-]{32,512})$/;
  return pattern.exec(values[0] ?? "")?.[1] ?? null;
}

function consultationAccessToken(request: { raw: { rawHeaders: string[] } }): string | null {
  const values: string[] = [];
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === "authorization") {
      values.push(request.raw.rawHeaders[index + 1] ?? "");
    }
  }
  if (values.length !== 1) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(values[0] ?? "");
  return match?.[1] ?? null;
}

function decodeCursor(value: string) {
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    const parsed = cursorPayloadSchema.safeParse(JSON.parse(decoded.toString("utf8")));
    if (!parsed.success) return null;
    return { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: { createdAt: Date; id: string } | null): string | null {
  if (!cursor) return null;
  return Buffer.from(JSON.stringify({ v: 1, createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString("base64url");
}

function canonicalizeDatabaseAmount(rawAmount: string): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(rawAmount);
  if (!match) throw new RegisteredExpenseQueryValidationError();
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  if (fraction.slice(2).split("").some((digit) => digit !== "0")) {
    throw new RegisteredExpenseQueryValidationError();
  }
  return `${whole}.${fraction.slice(0, 2).padEnd(2, "0")}`;
}

export function buildApp(options: BuildAppOptions = {}) {
  const {
    processCapture,
    processBankSmsCapture,
    processBankEmailCapture,
    decideTransaction,
    resolveAuthenticatedWorkspace,
    queryRegisteredExpenses,
    dashboard,
    ...fastifyOptions
  } = options;
  const app = Fastify(fastifyOptions);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = publicErrorStatusCode(error);
    if (
      error instanceof BankSmsAuthenticationError
      || error instanceof BankSmsValidationError
      || error instanceof BankSmsConfigurationError
      || error instanceof BankEmailAuthenticationError
      || error instanceof BankEmailValidationError
      || error instanceof BankEmailConfigurationError
      || error instanceof AuthenticatedWorkspaceAuthenticationError
      || error instanceof AuthenticatedWorkspaceAccessError
      || error instanceof RegisteredExpenseQueryValidationError
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

  if (dashboard) {
    app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(dashboard.assets.indexHtml));
    app.get("/styles.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(dashboard.assets.stylesCss));
    for (const [route, source] of Object.entries(dashboard.assets.modules)) {
      app.get(route, async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(source));
    }
    if (dashboard.clientConfig) {
      app.get("/v1/client-config", async () => dashboard.clientConfig);
    }
  }

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
      const token = bankBearerToken(request);
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
          amount: canonicalizeDatabaseAmount(outcome.transaction.amount),
          currency: outcome.transaction.currency,
          concept: outcome.transaction.concept,
          paymentMethod: outcome.transaction.paymentMethod
        }
      });
    });
  }

  if (processBankEmailCapture) {
    app.post("/v1/bank-email/captures", async (request, reply) => {
      const parsed = bankEmailCaptureSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({ status: "rejected", message: "La captura bancaria no es válida." });
      }
      const token = bankBearerToken(request, true);
      if (!token) return reply.code(401).send({ status: "rejected", message: "No autorizado." });

      try {
        const outcome = await processBankEmailCapture.execute({
          token,
          eventId: parsed.data.eventId,
          sender: parsed.data.sender,
          subject: parsed.data.subject,
          body: parsed.data.body,
          receivedAt: new Date(parsed.data.receivedAt),
          authentication: {
            spf: normalizeAuthenticationResult(parsed.data.authentication.spf),
            dkim: normalizeAuthenticationResult(parsed.data.authentication.dkim),
            dmarc: normalizeAuthenticationResult(parsed.data.authentication.dmarc),
            domain: parsed.data.authentication.domain
          }
        });
        return reply.code(outcome.duplicate ? 200 : 201).send({
          status: outcome.status,
          duplicate: outcome.duplicate,
          transactionId: outcome.transactionId,
          transaction: {
            amount: canonicalizeDatabaseAmount(outcome.transaction.amount),
            currency: outcome.transaction.currency,
            concept: outcome.transaction.concept,
            paymentMethod: outcome.transaction.paymentMethod
          }
        });
      } catch (error) {
        if (
          error instanceof BankEmailAuthenticationError
          || error instanceof BankEmailValidationError
          || error instanceof BankEmailConfigurationError
        ) throw error;

        const errorId = request.id;
        request.log.error({ errorId }, "Bank email capture failed");
        return reply.code(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Ocurrió un error interno. Intentá nuevamente.",
          errorId
        });
      }
    });
  }

  if (resolveAuthenticatedWorkspace && queryRegisteredExpenses) {
    app.get("/v1/transactions", async (request, reply) => {
      const parsed = transactionQuerySchema.safeParse(request.query);
      const decodedCursor = parsed.success && parsed.data.cursor ? decodeCursor(parsed.data.cursor) : undefined;
      const from = parsed.success ? new Date(parsed.data.from) : undefined;
      const to = parsed.success ? new Date(parsed.data.to) : undefined;
      if (!parsed.success || (parsed.data.cursor !== undefined && !decodedCursor) || !from || !to || from >= to) {
        return reply.code(400).send({ status: "rejected", message: "La consulta no es válida." });
      }

      const cursor = decodedCursor ?? undefined;
      const accessToken = consultationAccessToken(request);
      if (!accessToken) return reply.code(401).send({ status: "rejected", message: "No autorizado." });

      const workspace = await resolveAuthenticatedWorkspace.execute({ accessToken });
      const result = await queryRegisteredExpenses.execute({
        workspaceId: workspace.workspaceId,
        from,
        to,
        limit: parsed.data.limit === undefined ? 50 : Number(parsed.data.limit),
        ...(parsed.data.paymentMethod === undefined ? {} : { paymentMethod: parsed.data.paymentMethod }),
        ...(cursor === undefined ? {} : { cursor })
      });
      return reply.code(200).send({
        items: result.items.map((item) => ({
          id: item.id,
          amount: canonicalizeDatabaseAmount(item.amount),
          currency: item.currency,
          concept: item.concept,
          paymentMethod: item.paymentMethod,
          createdAt: item.createdAt.toISOString()
        })),
        totalCount: result.totalCount,
        totalsByCurrency: result.totalsByCurrency.map((total) => ({
          currency: total.currency,
          amount: canonicalizeDatabaseAmount(total.amount)
        })),
        nextCursor: encodeCursor(result.nextCursor)
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
