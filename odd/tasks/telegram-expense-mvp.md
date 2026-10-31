# Telegram Expense MVP
Objective: Deliver the first text-only Telegram expense-capture vertical slice through n8n into a validated finance backend.
Branch: `feat/telegram-expense-mvp` | Delivery: `stacked-to-main` (forecast: ~1,400 authored lines; default branch verified as `main`) | Test runner: Vitest + Fastify inject + Testcontainers/PostgreSQL where applicable.

## Specs

1. **S1 — First channel and flow.** Accepted decision: Telegram is the first MVP channel. The end-to-end flow is Telegram → n8n → backend API → PostgreSQL → response through Telegram. Text only is in scope; audio, images, OCR, other messaging channels, banking sync, dashboards, and SaaS billing are out of scope for this slice.
2. **S2 — Interpret the example.** The authorized example is: `Mensajes "Gaste 15.000 colones en Gasolina pague con Tarjeta".` Extract, as requested: `Gaste para saber que fue una salida de dinero, el monto, la moneda, el concepto y el medio de pago.` Normalize it as an expense for `15000`, `CRC`, `Gasolina`, and `card`, while retaining the original message.
3. **S3 — Required financial fields.** The required fields are exactly those requested in `los del punto 2`: transaction type, amount, currency, concept, and payment method. Rejected or incomplete input must not create a transaction.
4. **S4 — Explain and act on outcomes in Telegram.** On success, `devolver un mensaje a telegram con lo que paso`. For ambiguous, incomplete, duplicate, rejected, or internal-error outcomes, `debe devolver un mensaje explicando lo que paso`. Responses must distinguish registered, pending confirmation, needs information, possible duplicate, rejected, and processing error. For pending expenses, implement `Sólo confirmar y cancelar`; correction is deferred to a new message.
5. **S5 — Channel confirmation policy.** `el tema de la confirmación debería ser configurable por canal en una tabla de mantenimiento`. The backend resolves the Telegram channel policy and records the applied policy decision; invalid or duplicate data cannot bypass domain validation.
6. **S6 — Agreed backend architecture.** The accepted stack is Node.js + strict TypeScript + Fastify + PostgreSQL + Drizzle in a modular monolith with hexagonal boundaries. Domain code remains independent from Fastify, Drizzle, Telegram, n8n, and the AI provider. Monetary calculations must not use JavaScript floating-point arithmetic.

## Tasks

- **T1** [S6] `inline` — **done** — Bootstrap repository, strict TypeScript/Fastify tooling, test runner, local PostgreSQL configuration, and health check. RED/GREEN, full checks, npm audit, and independent verification passed. Commit: `b52b0bfa93ebcf904d781a0c0f9b3932db8c7afd`.
- **T2** [S2, S3, S5, S6] `inline` — **done** — Implement and test the pure domain model for captures, money, expense drafts, transaction outcomes, and channel confirmation policy. RED/GREEN and full checks passed. Commit: `d76679a8a1fefe6e7bc64fc5f4f7d83582eeaa91`.
- **T3** [S2, S3, S5, S6] `inline` — **done** — Implement Drizzle schema, migrations, and repositories for captures, transactions, and channel policies with persistence tests. RED/GREEN, tenant-isolation regressions, repeat-safe migrations, full checks, and npm audit passed. Commit: `5536291e19988419279d3c3822c379eab5fa9446`.
- **T4** [S2, S3, S4, S6] `inline` — **done** — Production runtime wired; atomic save-or-get, explicit duplicate outcomes, typed adapters, and concurrent-delivery regressions pass. Original commit: `807fb02d4afcf905b1df07ff74fc70eeef8be32c`; correction commit: `6800f9e70fd382c7b4da7cffc39ac873a878063b`.
- **T5** [S1, S4, S5] `inline` — **in_progress** — Reopened: implement tenant-scoped confirm/cancel actions and n8n success/error/action paths. Previous commit: `86b313c218b2e8614aef1021d0a736589c9bb8f1`; correction commit pending.
- **T6** [S1-S6] `inline` — **pending** — Final verification failed; rerun deterministic acceptance checks and correct operator/API documentation after T4-T5 close. Commit: pending.

## Log

- **L1 (2026-04-05):** `Entendido y de acuerdo, adelante`
- **L2 (2026-04-05):** Git initialization, feature branch creation, and local Conventional Commit work units were explicitly authorized. No push or PR was authorized.
- **L3 (2026-04-05):** Repository began empty except for `.atl/`; no existing application conventions constrain the implementation.
- **L4 (2026-04-05):** User selected `stacked-to-main`; the verified default branch is `main`. Push, PR creation, and merge remain unauthorized.
- **L5 (2026-04-05):** T1 observed RED (missing `src/app.ts`), then GREEN: typecheck, 1/1 test, build, and npm audit with zero vulnerabilities. Independent verifier returned PASS for S6.
- **L6 (2026-04-05):** User supplied repository-local Git author identity. Global Git configuration remains unchanged.
- **L7 (2026-04-05):** T1 closed in commit `b52b0bfa93ebcf904d781a0c0f9b3932db8c7afd`; T2 started.
- **L8 (2026-04-05):** T2 observed RED for missing domain modules, then GREEN: 15/15 focused tests and 16/16 full tests passed with typecheck and build. Closed in commit `d76679a8a1fefe6e7bc64fc5f4f7d83582eeaa91`; T3 started.
- **L9 (2026-04-05):** Docker/PostgreSQL binaries were unavailable, so T3 uses isolated PGlite while retaining node-postgres for production. Drizzle Kit was removed after its secure beta proved incompatible with stable Drizzle ORM; versioned PostgreSQL SQL migrations are repository-owned instead.
- **L10 (2026-04-05):** Independent T3 verification failed on cross-workspace transaction isolation and repeat migration safety. The verifier also created `.codegraph/` unexpectedly during read-only verification; it is excluded from Git and not part of the product diff.
- **L11 (2026-04-05):** T3 fixes observed RED for repeat migration and cross-workspace persistence, then GREEN: 10/10 focused tests and 26/26 full tests passed with typecheck, build, and zero audit vulnerabilities. Closed in commit `5536291e19988419279d3c3822c379eab5fa9446`; T4 started. Risk: item 1 (tenant-scoped financial persistence), mitigated by database constraints and regression tests.
- **L12 (2026-04-05):** T4 observed RED for missing application/API modules, then GREEN: accepted Spanish expense, incomplete input, and repeated delivery passed; 29/29 full tests, typecheck, build, and audit passed. Closed in commit `807fb02d4afcf905b1df07ff74fc70eeef8be32c`; T5 started.
- **L13 (2026-04-05):** T5 observed RED for confirmation actions and missing n8n template, then GREEN: 5/5 focused and 31/31 full tests passed. Closed in commit `86b313c218b2e8614aef1021d0a736589c9bb8f1`; T6 started.
- **L14 (2026-04-05):** Final independent verification failed: production `main.ts` exposed only health, concurrent duplicate delivery was not hardened, duplicate/error Telegram messaging was incomplete, and returned action labels were not executable. T4-T5 reopened; no completion was claimed.
- **L15 (2026-04-05):** User selected `Sólo confirmar y cancelar`. Correction is deferred to sending a new message. T4 correction started.
- **L16 (2026-04-05):** T4 correction observed RED for missing production bootstrap and 500 responses under the new atomic port; GREEN: 16/16 focused and 33/33 full tests passed with typecheck, build, audit, and diff check. Closed in `6800f9e70fd382c7b4da7cffc39ac873a878063b`; T5 correction started.
