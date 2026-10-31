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

5. Import `integrations/n8n/telegram-expense-workflow.json` into n8n.
6. Configure Telegram credentials on its trigger/action nodes and set these n8n environment variables:
   - `FINANCE_API_URL`, for example `http://host.docker.internal:3000`;
   - `FINANCE_WORKSPACE_ID`, a UUID identifying the tenant.

Check `GET /health`; it should return `{"status":"ok"}`.

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
