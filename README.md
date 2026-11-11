# Finanzas al Toque

Finanzas al Toque is a Telegram-first personal-finance MVP. A user sends a Spanish expense as text or a short voice note; n8n transcribes voice with OpenAI and forwards only text to a Fastify API; the backend interprets, validates, deduplicates, and persists the transaction in PostgreSQL. Telegram explains the outcome and, when required, offers **Confirm** and **Cancel** actions.

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
6. Configure the same Telegram credential on the trigger, file-download, and Telegram action nodes. The trigger subscribes to both messages and callback queries, avoiding Telegram's one-webhook-per-bot conflict.
7. Configure an OpenAI credential on **Transcribe voice note**.
8. Configure the finance API values:
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
  "origin": "text",
  "message": "Gaste 15.000 colones en Gasolina pague con Tarjeta"
}
```

The optional `origin` accepts `text` or `voice` and defaults to text behavior when omitted. The accepted example is normalized to an expense for `15000` `CRC`, concept `Gasolina`, and payment method `card`. The original text or transcript is retained with the capture.

| Result | HTTP | Meaning |
|---|---:|---|
| `registered` | 201 | The channel policy allowed immediate registration. |
| `pending_confirmation` | 201 | Telegram should show Confirm and Cancel buttons. |
| Existing delivery | 200 | `duplicate: true`; no second transaction was created. |
| `needs_information` | 422 | Required fields are listed; no transaction was created. |
| `rejected` | 400 | The request contract was invalid. |
| Internal failure | 500 | The response is sanitized and includes a correlation `errorId`; internal details stay in server logs. |

Unexpected server failures return a stable public contract without SQL, parameters, stack traces, or infrastructure details:

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Ocurrió un error interno. Intentá nuevamente.",
  "errorId": "request-correlation-id"
}
```

Use `errorId` to correlate the client or Telegram report with the detailed server log entry. Expected 4xx validation and business responses keep their specific public messages.

The idempotency key is `(workspaceId, channel, externalMessageId)`. Concurrent repeated deliveries converge on one transaction.

## Capture a voice expense

Send a Telegram voice note of at most **2 minutes** using the same Spanish phrasing accepted for text expenses. The workflow:

1. rejects longer notes before downloading them;
2. downloads the Telegram voice file transiently;
3. transcribes it in Spanish through OpenAI;
4. sends only the transcript to `POST /v1/captures` with `origin: "voice"` and the original Telegram `message_id`;
5. always asks the user to **Confirm** or **Cancel**, regardless of the configured Telegram text policy.

The application stores the transcript as the capture's original message; it does not send audio, file IDs, blobs, or file metadata to the finance API or PostgreSQL. Telegram, n8n, and OpenAI still process the audio, so operators must configure their execution-history and provider-retention settings according to their privacy policy.

Download or transcription failures return `No pude descargar o transcribir la nota de voz. Intentá nuevamente.` No transaction API call is made on that failure path. If the transcript lacks required expense fields, the existing `needs_information` response explains what is missing.

## Payment-method catalog provisioning

Payment methods are workspace-scoped records in `payment_methods`. The catalog starts empty: the application does not seed default methods and has no administrative API for them. Provision each workspace directly in the database before accepting captures. For example:

```sql
INSERT INTO payment_methods (workspace_id, code, label, enabled)
VALUES ('10000000-0000-4000-8000-000000000001', 'card', 'Tarjeta', true);
```

`id` is a database-generated UUID; `code` is the canonical value stored on transactions; `label` is the maintained user-facing value. Transactions have a database foreign key from `(workspace_id, payment_method)` to `(workspace_id, code)`, so provision the matching workspace catalog row before inserting a transaction. Capture processing accepts an enabled method only when its extracted value matches exactly one enabled code or label in that workspace (case- and accent-insensitively); ambiguous matches are rejected and no transaction is created. Disable a method with `UPDATE payment_methods SET enabled = false, updated_at = now() WHERE workspace_id = '<workspace UUID>' AND code = '<code>';`.

Migration `0003_payment_method_catalog` adds the transaction foreign key as `NOT VALID`, so it enforces new writes without rejecting historical transactions that predate catalog provisioning. After provisioning every historical `(workspace_id, payment_method)` pair, validate it manually:

```sql
ALTER TABLE transactions
  VALIDATE CONSTRAINT transactions_workspace_payment_method_fk;
```

## Coope Ande bank-SMS pilot

The API can register Coope Ande card-purchase SMS messages directly from a per-device iPhone Shortcut credential. Operators should follow the focused [Coope Ande iPhone Shortcut pilot guide](docs/bank-sms-iphone-shortcut.md) for provisioning, token handling, notifications, rotation, and rollback.

| Operator action | Command or endpoint |
|---|---|
| View credential and template commands | `npm run bank-sms:admin -- --help` |
| Receive a device-authenticated bank SMS | `POST /v1/bank-sms/captures` |

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
| n8n | Telegram text/voice routing, transient audio download, OpenAI transcription, buttons, callbacks, and error replies |

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

Persistence and production-composition tests use isolated PGlite state; production uses PostgreSQL through `pg` and Drizzle. Tests cover text and voice-originated captures, missing fields, sequential and concurrent duplicates, tenant isolation, repeat-safe migrations, channel policies, mandatory voice confirmation, confirm/cancel decisions, sanitized 500 responses with server-side correlation logs, and n8n text/voice/callback/error paths.

## Current scope

Included: Telegram text capture, Telegram voice notes up to two minutes transcribed by OpenAI in n8n, transcript-only backend persistence, mandatory voice confirmation, the Coope Ande iPhone bank-SMS pilot, PostgreSQL persistence, channel confirmation policies for text, idempotency, Confirm/Cancel callbacks, and explanatory responses.

Excluded: audio-file uploads, backend audio storage, transcript editing, images, OCR, other messaging channels, generalized bank synchronization beyond the Coope Ande SMS pilot, dashboards, billing, correction callbacks, and a generalized AI expense interpreter.
