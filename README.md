# Finanzas al Toque

Finanzas al Toque is a text-first personal-finance MVP. A user sends a Spanish expense message to Telegram; n8n forwards it to a Fastify API; the backend interprets, validates, deduplicates, and persists the transaction in PostgreSQL; Telegram explains the outcome and, when required, offers **Confirm** and **Cancel** actions.

## Quick path

1. Install dependencies: `npm install`.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Apply all versioned migrations:

   ```bash
   DATABASE_URL=postgres://finanzas:finanzas@localhost:5432/finanzas npm run db:migrate
   ```

4. Start the API:

   ```bash
   DATABASE_URL=postgres://finanzas:finanzas@localhost:5432/finanzas npm run dev
   ```

5. Import the workflow that matches the n8n runtime:
   - n8n Cloud: `integrations/n8n/telegram-expense-workflow-cloud.json`;
   - self-hosted n8n: `integrations/n8n/telegram-expense-workflow.json`.
6. Configure the same Telegram credential on the single trigger node and all Telegram action nodes. The trigger subscribes to both messages and callback queries, avoiding Telegram's one-webhook-per-bot conflict.
7. Configure the finance API values:
   - n8n Cloud custom variables: `FINANCE_API_URL` and `FINANCE_WORKSPACE_ID` (the Cloud template reads them through `$vars`);
   - self-hosted environment variables: `FINANCE_API_URL` and `FINANCE_WORKSPACE_ID` (the self-hosted template reads them through `$env`).

For n8n Cloud, `FINANCE_API_URL` must be a publicly reachable HTTPS URL. A self-hosted n8n instance may use a private HTTP URL when it can reach the API directly. `FINANCE_WORKSPACE_ID` is a UUID identifying the tenant. Check `GET /health`; it should return `{"status":"ok"}`.

## Capture an expense

`POST /v1/captures`

```json
{
  "workspaceId": "10000000-0000-4000-8000-000000000001",
  "externalMessageId": "telegram-42",
  "channel": "telegram",
  "message": "Gaste 15.000 colones en Gasolina pague con Tarjeta"
}
```

The accepted example is normalized to an expense for `15000` `CRC`, concept `Gasolina`, and payment method `card`. The original message is retained with the capture.

| Result | HTTP | Meaning |
|---|---:|---|
| `registered` | 201 | The channel policy allowed immediate registration. |
| `pending_confirmation` | 201 | Telegram should show Confirm and Cancel buttons. |
| Existing delivery | 200 | `duplicate: true`; no second transaction was created. |
| `needs_information` | 422 | Required fields are listed; no transaction was created. |
| `rejected` | 400 | The request contract was invalid. |

The idempotency key is `(workspaceId, channel, externalMessageId)`. Concurrent repeated deliveries converge on one transaction.

## Payment-method catalog provisioning

Payment methods are workspace-scoped records in `payment_methods`. The catalog starts empty: the application does not seed default methods and has no administrative API for them. Provision each workspace directly in the database before accepting captures. For example:

```sql
INSERT INTO payment_methods (workspace_id, code, label, enabled)
VALUES ('10000000-0000-4000-8000-000000000001', 'card', 'Tarjeta', true);
```

`code` is the canonical value stored on transactions; `label` is the maintained user-facing value. Capture processing accepts an enabled method only when its extracted value matches exactly one enabled code or label in that workspace (case- and accent-insensitively); ambiguous matches are rejected and no transaction is created. Disable a method with `UPDATE payment_methods SET enabled = false, updated_at = now() WHERE workspace_id = '<workspace UUID>' AND code = '<code>';`.

## Confirm or cancel

`POST /v1/transactions/:transactionId/decision`

```json
{
  "workspaceId": "10000000-0000-4000-8000-000000000001",
  "action": "confirm"
}
```

`action` accepts only `confirm` or `cancel`. Decisions are workspace-scoped:

- `200`: confirmed or cancelled;
- `404`: the workspace cannot see that transaction;
- `409`: the transaction was already processed with an incompatible decision;
- `400`: invalid request.

Correction is intentionally outside this MVP action flow. The user sends a new Telegram message instead.

## Architecture

| Layer | Responsibility |
|---|---|
| Domain | Money, expense drafts, outcomes, and confirmation policies |
| Application | Capture and decision use cases expressed through ports |
| Infrastructure | PostgreSQL/Drizzle repositories, migrations, and Spanish interpreter |
| API | HTTP validation and outcome/status mapping |
| n8n | Telegram transport, buttons, callbacks, and error replies |

The interpreter never writes directly to the database. The backend is the authority for validation, tenant isolation, idempotency, confirmation policy, transitions, and persistence. The current deterministic Spanish interpreter is replaceable through the `MessageInterpreter` port by an AI-backed adapter later.

## Deploy on Vercel

This change makes the API deployable on Vercel; it does **not** deploy it. Vercel detects `src/server.ts` as the Fastify Function entrypoint. Use Node.js 22.x (pinned in `package.json`).

1. Create a Vercel project from this repository and configure these environment variables:
   - `DATABASE_URL`: the Supabase **shared transaction pooler** connection string, using port `6543`.
   - `DATABASE_CA_CERT`: the PEM CA certificate for that Supabase connection. Store the full certificate as an environment variable for Preview and Production; do not commit it. Every Vercel deployment fails at startup if it is absent, rather than disabling certificate verification.
2. Run `npm run db:migrate` separately against the target database before serving traffic. Migrations are not run by the serverless function.
3. After deployment, verify `GET https://<your-vercel-domain>/health` returns `{"status":"ok"}`.
4. Update n8n `FINANCE_API_URL` to `https://<your-vercel-domain>` (and keep `FINANCE_WORKSPACE_ID` configured as before).

The function reuses its module-scoped PostgreSQL pool between warm invocations and limits that pool to one connection on Vercel. Local development remains unchanged: `npm run dev` and `npm start` use `src/main.ts` and only enable TLS when `DATABASE_CA_CERT` is supplied.

## Verification

```bash
npm run check
npm audit
git diff --check
```

Persistence and production-composition tests use isolated PGlite state; production uses PostgreSQL through `pg` and Drizzle. Tests cover the accepted message, missing fields, sequential and concurrent duplicates, tenant isolation, repeat-safe migrations, channel policies, confirm/cancel decisions, and n8n callback/error paths.

## Current scope

Included: Telegram text capture, PostgreSQL persistence, channel confirmation policies, idempotency, Confirm/Cancel callbacks, and explanatory responses.

Excluded: audio, images, OCR, other messaging channels, bank synchronization, dashboards, billing, correction callbacks, and a generalized AI interpreter.
