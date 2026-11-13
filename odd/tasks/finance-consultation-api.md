# Finance consultation API
Objective: Implement the accepted first stage of consultation and visualization as a secure, read-only, paginated registered-expense API.
Branch: `feat/finance-consultation-api`. Delivery: `stacked-to-main`; forecast ~650 authored changed lines. Test runner: `npm run check`.

## Specs
- S1 — “ME parece bien que sigamos con ese paso de consulta y visualización de la información, cual sería la propuesta?”
- S2 — “de acuerdo con el planteamiento, procedeamos con la implementación”
- Assumption A1 — The accepted first implementation stage is the previously proposed secure consultation API; the dashboard remains a later feature after this API is verified.
- Assumption A2 — Consultation is read-only, includes only registered expenses, keeps totals separate by currency, and never treats a caller-provided workspace UUID as authorization.
- Assumption A3 — Supabase Auth identifies the user, and server-side membership resolves the authorized workspace.

## Tasks
- T1 [S1-S2] [route: bounded worker via context backstop] [status: in_progress] Add authenticated user-to-workspace resolution with tests and migration. Commit: pending.
- T2 [S1-S2] [route: parent inline] [status: pending] Add decimal-safe, paginated registered-expense query and totals with filters and tests. Commit: pending.
- T3 [S1-S2] [route: parent inline] [status: pending] Expose the authenticated HTTP endpoint and document its contract and production configuration. Commit: pending.
- T4 [S1-S2] [route: independent verifier required for security risk item 2] [status: pending] Run full verification, tenant-isolation probes, and close the feature. Commit: pending.

## Log
- L1 — “de acuerdo con el planteamiento, procedeamos con la implementación”
- L2 — Scope basis: the accepted proposal recommends the secure paginated consultation API as the next feature, before building the dashboard.
- L3 — Existing evidence: transactions are workspace-scoped and include amount, currency, concept, payment method, status, and createdAt; no read API, category model, or frontend exists.
- L4 — Risk: item 2 (authentication and tenant authorization). Dependency or deployment changes, if needed, also invoke item 5.
- L5 — User selected `stacked-to-main`; verified destination default branch is `main`.
- L6 — Supabase primary documentation supports local JWT verification against the project JWKS with issuer, audience, signature, and expiration checks; workspace membership remains database-backed so access changes are not delegated to user-editable metadata.
- L7 — User authorized the exact offline dependency command `npm install jose@6.2.14 --save-exact --offline` for T1.
- L8 — The one authorized offline install failed with `ENOTCACHED`; no files changed, no tests ran, and no online retry was attempted.
- L9 — User authorized the exact online command `npm install jose@6.2.14 --save-exact`.
