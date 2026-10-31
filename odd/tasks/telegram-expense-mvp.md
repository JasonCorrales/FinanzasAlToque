# Telegram Expense MVP
Objective: Deliver the first text-only Telegram expense-capture vertical slice through n8n into a validated finance backend.
Branch: `feat/telegram-expense-mvp` | Delivery: `stacked-to-main` (forecast: ~1,400 authored lines; default branch verified as `main`) | Test runner: Vitest + Fastify inject + Testcontainers/PostgreSQL where applicable.

## Specs

1. **S1 — First channel and flow.** Accepted decision: Telegram is the first MVP channel. The end-to-end flow is Telegram → n8n → backend API → PostgreSQL → response through Telegram. Text only is in scope; audio, images, OCR, other messaging channels, banking sync, dashboards, and SaaS billing are out of scope for this slice.
2. **S2 — Interpret the example.** The authorized example is: `Mensajes "Gaste 15.000 colones en Gasolina pague con Tarjeta".` Extract, as requested: `Gaste para saber que fue una salida de dinero, el monto, la moneda, el concepto y el medio de pago.` Normalize it as an expense for `15000`, `CRC`, `Gasolina`, and `card`, while retaining the original message.
3. **S3 — Required financial fields.** The required fields are exactly those requested in `los del punto 2`: transaction type, amount, currency, concept, and payment method. Rejected or incomplete input must not create a transaction.
4. **S4 — Explain every outcome in Telegram.** On success, `devolver un mensaje a telegram con lo que paso`. For ambiguous, incomplete, duplicate, rejected, or internal-error outcomes, `debe devolver un mensaje explicando lo que paso`. Responses must distinguish registered, pending confirmation, needs information, possible duplicate, rejected, and processing error.
5. **S5 — Channel confirmation policy.** `el tema de la confirmación debería ser configurable por canal en una tabla de mantenimiento`. The backend resolves the Telegram channel policy and records the applied policy decision; invalid or duplicate data cannot bypass domain validation.
6. **S6 — Agreed backend architecture.** The accepted stack is Node.js + strict TypeScript + Fastify + PostgreSQL + Drizzle in a modular monolith with hexagonal boundaries. Domain code remains independent from Fastify, Drizzle, Telegram, n8n, and the AI provider. Monetary calculations must not use JavaScript floating-point arithmetic.

## Tasks

- **T1** [S6] `inline` — **done** — Bootstrap repository, strict TypeScript/Fastify tooling, test runner, local PostgreSQL configuration, and health check. RED/GREEN, full checks, npm audit, and independent verification passed. Commit: `b52b0bfa93ebcf904d781a0c0f9b3932db8c7afd`.
- **T2** [S2, S3, S5, S6] `inline` — **in_progress** — Implement and test the pure domain model for captures, money, expense drafts, transaction outcomes, and channel confirmation policy. Commit: pending.
- **T3** [S2, S3, S5, S6] `inline` — **pending** — Implement Drizzle schema, migrations, and repositories for captures, transactions, and channel policies with persistence tests. Commit: pending.
- **T4** [S2, S3, S4, S6] `inline` — **pending** — Implement the interpreter port, deterministic MVP interpreter adapter, capture use case, idempotent API, and outcome contracts test-first. Commit: pending.
- **T5** [S1, S4, S5] `inline` — **pending** — Implement confirmation/correction outcome handling and provide the n8n/Telegram integration contract and workflow template. Commit: pending.
- **T6** [S1-S6] `inline` — **pending** — Run the full end-to-end acceptance examples, independent high-risk verification, and complete operator/API documentation. Commit: pending.

## Log

- **L1 (2026-04-05):** `Entendido y de acuerdo, adelante`
- **L2 (2026-04-05):** Git initialization, feature branch creation, and local Conventional Commit work units were explicitly authorized. No push or PR was authorized.
- **L3 (2026-04-05):** Repository began empty except for `.atl/`; no existing application conventions constrain the implementation.
- **L4 (2026-04-05):** User selected `stacked-to-main`; the verified default branch is `main`. Push, PR creation, and merge remain unauthorized.
- **L5 (2026-04-05):** T1 observed RED (missing `src/app.ts`), then GREEN: typecheck, 1/1 test, build, and npm audit with zero vulnerabilities. Independent verifier returned PASS for S6.
- **L6 (2026-04-05):** User supplied repository-local Git author identity. Global Git configuration remains unchanged.
- **L7 (2026-04-05):** T1 closed in commit `b52b0bfa93ebcf904d781a0c0f9b3932db8c7afd`; T2 started.
