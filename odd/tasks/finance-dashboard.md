# Finance dashboard
Objective: Design and implement a responsive, production-connected dashboard for Finanzas al Toque.
Branch: `feat/finance-dashboard`. Delivery: `stacked-to-main`. Test runner: `npm test` plus `npm run web:build`.

## Specs
- S1 — “listo continuemos con el dashboard”
- S2 — “Login + dashboard funcional”

## Tasks
- T1 [S1-S2] [route: bounded design writer via context backstop] [status: done] Create three responsive dashboard design directions and record the selected artboard. Commit: 240c8f6.
- T2 [S2] [route: bounded writer if the implementation surface remains isolated] [status: done] Add the browser frontend foundation and Supabase email/password authentication. Commit: b949d20.
- T3 [S1-S2] [route: bounded writer if independent from deployment integration] [status: done] Implement the responsive transaction dashboard against `GET /v1/transactions`, including date filters, totals, states, and cursor pagination. Commit: pending.
- T4 [S1-S2] [route: parent integration] [status: in_progress] Integrate same-origin production delivery, update configuration and documentation, and preserve existing API routes. Commit: pending.
- T5 [S1-S2] [route: parent checks + independent verifier for risk items 2 and 5] [status: pending] Run focused, full, responsive, authentication, and production-routing verification and close the feature. Commit: pending.

## Log
- L1 — “listo continuemos con el dashboard”
- L2 — User selected “Login + dashboard funcional”.
- L3 — Existing repository is a backend-only Fastify service with no frontend, browser authentication client, static deployment configuration, or CORS support.
- L4 — The verified API returns registered expenses, decimal-string totals by currency, strict date filtering, and cursor pagination.
- L5 — Initial architecture direction: prefer same-origin frontend delivery to avoid introducing cross-origin authorization unless implementation evidence disproves it.
- L6 — No project design sources or existing design system were detected; T1 will create three clearly different standalone directions before production UI implementation.
- L7 — Risk: item 2 (browser authentication) and item 5 (frontend build and production delivery). The attempted `git fetch origin main` timed out after 30 seconds without updating refs or creating the feature branch; the branch was then created from the already-present verified `origin/main` ref `351274750f7d7324ebdd4fa705f684faf2f2245f`.
- L8 — Design directions created under `design/finance-dashboard/`: `01-libro-mayor.html`, `02-corte-del-periodo.html`, and `03-linea-de-tiempo-movil.html`.
- L9 — User selected `02-corte-del-periodo.html` (“Corte del período”) for implementation; `01-libro-mayor.html` and `03-linea-de-tiempo-movil.html` remain alternatives. Gentle Design handoff is in progress.
- L10 — T2 RED observed because the browser auth module did not exist. GREEN passed `test/web/auth.test.ts` (4 tests), `npm run web:build`, root typecheck, and `git diff --check`. The browser stores only the access token in `sessionStorage`, loads same-origin public auth configuration, masks provider diagnostics, restores sessions, signs out explicitly, and keeps dashboard content unavailable before authentication.
- L11 — The user selected `stacked-to-main` after the running authored change count reached 616 lines. Planned review slices: slice 1 design direction `240c8f6`; slice 2 browser authentication `b949d20`; slice 3 transaction dashboard; slice 4 production integration and closure. The 535-line authentication unit remains one cohesive slice because it includes its UI, generated browser modules, and tests; no commit history rewrite was authorized. No push or PR creation is authorized.
- L12 — T3 RED observed because the dashboard module did not exist. GREEN passed 5 dashboard tests plus 4 authentication regressions, browser build, root typecheck, and diff checks. Parent correction added same-day inclusive date coverage, accurate invalid-period copy, and a loading lifecycle that clears `aria-busy` and prevents duplicate load-more clicks. The UI now renders decimal-safe totals by currency, registration-time rows, exact payment-method filtering, explicit cursor pagination, and responsive/accessible states without adding unsupported analytics.
