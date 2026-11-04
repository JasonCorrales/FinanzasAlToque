import { randomUUID } from "node:crypto";

import type { FastifyServerOptions } from "fastify";

import { DecideTransaction } from "./application/decide-transaction.js";
import { ProcessCapture } from "./application/process-capture.js";
import { buildApp } from "./http-app.js";
import { SpanishExpenseInterpreter } from "./infrastructure/interpreters/spanish-expense-interpreter.js";
import { DrizzleCaptureRepository } from "./infrastructure/repositories/drizzle-capture-repository.js";
import { DrizzleConfirmationPolicyRepository } from "./infrastructure/repositories/drizzle-confirmation-policy-repository.js";
import { DrizzlePaymentMethodCatalogRepository } from "./infrastructure/repositories/drizzle-payment-method-catalog-repository.js";
import { DrizzleTransactionRepository } from "./infrastructure/repositories/drizzle-transaction-repository.js";
import type { FinanceDatabase } from "./infrastructure/repositories/database.js";

interface ProductionAppOptions extends FastifyServerOptions {
  nextId?: () => string;
}

export function buildProductionApp(
  db: FinanceDatabase,
  options: ProductionAppOptions = {}
) {
  const { nextId = randomUUID, ...fastifyOptions } = options;
  const transactions = new DrizzleTransactionRepository(db);
  const processCapture = new ProcessCapture({
    captures: new DrizzleCaptureRepository(db),
    transactions,
    confirmationPolicies: new DrizzleConfirmationPolicyRepository(db),
    paymentMethods: new DrizzlePaymentMethodCatalogRepository(db),
    interpreter: new SpanishExpenseInterpreter(),
    nextId
  });

  const decideTransaction = new DecideTransaction(transactions);

  return buildApp({ ...fastifyOptions, processCapture, decideTransaction });
}
