import { randomUUID } from "node:crypto";

import type { FastifyServerOptions } from "fastify";

import { DecideTransaction } from "./application/decide-transaction.js";
import { ProcessBankEmailCapture } from "./application/process-bank-email-capture.js";
import { ProcessBankSmsCapture } from "./application/process-bank-sms-capture.js";
import { ProcessCapture } from "./application/process-capture.js";
import { QueryRegisteredExpenses } from "./application/query-registered-expenses.js";
import { ResolveAuthenticatedWorkspace } from "./application/resolve-authenticated-workspace.js";
import { buildApp } from "./http-app.js";
import { SupabaseJwtVerifier } from "./infrastructure/auth/supabase-jwt-verifier.js";
import { SpanishExpenseInterpreter } from "./infrastructure/interpreters/spanish-expense-interpreter.js";
import { DrizzleBankEmailCaptureAuditRepository } from "./infrastructure/repositories/drizzle-bank-email-capture-audit-repository.js";
import { DrizzleBankEmailCredentialRepository } from "./infrastructure/repositories/drizzle-bank-email-credential-repository.js";
import { DrizzleBankEmailTemplateRepository } from "./infrastructure/repositories/drizzle-bank-email-template-repository.js";
import { DrizzleBankSmsCaptureAuditRepository } from "./infrastructure/repositories/drizzle-bank-sms-capture-audit-repository.js";
import { DrizzleBankSmsCredentialRepository } from "./infrastructure/repositories/drizzle-bank-sms-credential-repository.js";
import { DrizzleBankSmsTemplateRepository } from "./infrastructure/repositories/drizzle-bank-sms-template-repository.js";
import { DrizzleCaptureRepository } from "./infrastructure/repositories/drizzle-capture-repository.js";
import { DrizzleConfirmationPolicyRepository } from "./infrastructure/repositories/drizzle-confirmation-policy-repository.js";
import { DrizzlePaymentMethodCatalogRepository } from "./infrastructure/repositories/drizzle-payment-method-catalog-repository.js";
import { DrizzleTransactionQueryRepository } from "./infrastructure/repositories/drizzle-transaction-query-repository.js";
import { DrizzleTransactionRepository } from "./infrastructure/repositories/drizzle-transaction-repository.js";
import { DrizzleWorkspaceMembershipRepository } from "./infrastructure/repositories/drizzle-workspace-membership-repository.js";
import type { FinanceDatabase } from "./infrastructure/repositories/database.js";
import {
  loadDashboardRuntime,
  type DashboardEnvironment,
  type DashboardRuntime
} from "./infrastructure/web/public-assets.js";

interface ProductionAppOptions extends FastifyServerOptions {
  nextId?: () => string;
  environment?: DashboardEnvironment;
  dashboard?: DashboardRuntime;
}

export function buildAuthenticatedWorkspaceResolver(
  db: FinanceDatabase,
  supabaseUrl = process.env.SUPABASE_URL
): ResolveAuthenticatedWorkspace {
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required");

  return new ResolveAuthenticatedWorkspace({
    users: new SupabaseJwtVerifier({ supabaseUrl }),
    memberships: new DrizzleWorkspaceMembershipRepository(db)
  });
}

export function buildProductionApp(
  db: FinanceDatabase,
  options: ProductionAppOptions = {}
) {
  const {
    nextId = randomUUID,
    environment = process.env,
    dashboard = loadDashboardRuntime(environment),
    ...fastifyOptions
  } = options;
  const transactions = new DrizzleTransactionRepository(db);
  const processCapture = new ProcessCapture({
    captures: new DrizzleCaptureRepository(db),
    transactions,
    confirmationPolicies: new DrizzleConfirmationPolicyRepository(db),
    paymentMethods: new DrizzlePaymentMethodCatalogRepository(db),
    interpreter: new SpanishExpenseInterpreter(),
    nextId
  });

  const processBankSmsCapture = new ProcessBankSmsCapture({
    captures: new DrizzleCaptureRepository(db),
    transactions,
    paymentMethods: new DrizzlePaymentMethodCatalogRepository(db),
    credentials: new DrizzleBankSmsCredentialRepository(db),
    templates: new DrizzleBankSmsTemplateRepository(db),
    audits: new DrizzleBankSmsCaptureAuditRepository(db),
    nextId
  });
  const processBankEmailCapture = new ProcessBankEmailCapture({
    captures: new DrizzleCaptureRepository(db),
    transactions,
    paymentMethods: new DrizzlePaymentMethodCatalogRepository(db),
    credentials: new DrizzleBankEmailCredentialRepository(db),
    templates: new DrizzleBankEmailTemplateRepository(db),
    audits: new DrizzleBankEmailCaptureAuditRepository(db),
    nextId
  });
  const decideTransaction = new DecideTransaction(transactions);
  const resolveAuthenticatedWorkspace = buildAuthenticatedWorkspaceResolver(db, environment.SUPABASE_URL);
  const queryRegisteredExpenses = new QueryRegisteredExpenses(new DrizzleTransactionQueryRepository(db));

  return buildApp({
    ...fastifyOptions,
    processCapture,
    processBankSmsCapture,
    processBankEmailCapture,
    decideTransaction,
    resolveAuthenticatedWorkspace,
    queryRegisteredExpenses,
    dashboard
  });
}
