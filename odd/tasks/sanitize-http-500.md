# Sanitize HTTP 500 Errors

Prevent internal failures from leaking implementation, database, or infrastructure details through public HTTP responses.
Keep enough server-side context to correlate and diagnose each failure safely.

## Specs

1. **S1** — “procedamos con la funcionalidad de sanitizar los errores HTTP 500”

## Tasks

- **T1** — S1 — Add public-interface tests proving HTTP 500 responses use a stable safe message, expose a correlation identifier, and contain no internal error details. Route: inline. Status: done (RED observed). Commit: `f2fba4b`.
- **T2** — S1 — Add centralized Fastify error handling that logs the original failure server-side and returns only the sanitized public contract for unexpected 5xx errors. Route: inline. Status: done. Commit: `f2fba4b`.
- **T3** — S1 — Document the error contract and run security-risk verification, focused checks, and the full suite. Route: independent verifier + inline checks. Status: done. Commit: `f2fba4b`.

## Log

- **L1** — “ok perfecto, procedamos con la funcionalidad de sanitizar los errores HTTP 500”
- **L2** — RED reproduced the leak with `Failed query: insert into transactions; parameters: super-secret` in the public 500 response. GREEN returns only the safe contract and correlation ID while retaining the original error in logs. The full suite passed 62 tests; focused tests, typecheck, build, and diff checks passed after narrowing unknown errors safely.
- **L3** — Independent verification passed S1. Its residual-risk review identified that “No se registró ningún cambio” could overpromise when a failure occurs after a partial side effect; the public message was corrected to “Ocurrió un error interno. Intentá nuevamente.” and the regression now exercises an explicit `statusCode: 503` error.
- **L4** — Security work unit committed as `f2fba4b`. No push, PR, deployment, or live Vercel verification was performed.
