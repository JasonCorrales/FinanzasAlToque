# BAC email backend contract

This is the backend-only contract for a future BAC email adapter. Start by assigning an enabled workspace payment method, then create one adapter credential. The adapter sends each email once with a stable `eventId`.

> **Out of scope and not implemented:** Gmail Apps Script, Gmail filters, mailbox polling, and adapter deployment. This repository provides neither mailbox access nor a deployed adapter.

## Provisioning

Use an administrator checkout with `DATABASE_URL` set and migrations applied. Substitute placeholders; do not place tokens in source control, tickets, or logs.

```bash
export WORKSPACE_UUID="10000000-0000-4000-8000-000000000001"

# The method must already exist and be enabled in this workspace.
DATABASE_URL="postgres://..." npm run bank-email:admin -- assign-bac-purchase \
  --workspace "$WORKSPACE_UUID" --payment-method card

# Copy the printed token directly into the future adapter once.
DATABASE_URL="postgres://..." npm run bank-email:admin -- create-adapter \
  --workspace "$WORKSPACE_UUID"

# Metadata only: no plaintext token or stored hash is returned.
DATABASE_URL="postgres://..." npm run bank-email:admin -- list-adapters \
  --workspace "$WORKSPACE_UUID"
```

The assignment is fixed to source `bac_purchase`, version `bac-email-v1`, and the label `BAC email adapter`. Assignment rejects missing, disabled, or another workspace's payment method through the payment-method repository.

| Need | Command | Result |
|---|---|---|
| Replace a suspected token | `npm run bank-email:admin -- rotate-adapter --workspace "$WORKSPACE_UUID" --credential "<credential UUID>"` | Revokes the old credential and prints a new token once. |
| Stop an adapter | `npm run bank-email:admin -- revoke-adapter --workspace "$WORKSPACE_UUID" --credential "<credential UUID>"` | Makes that workspace credential inactive immediately. |
| View command validation | `npm run bank-email:admin -- --help` | Shows accepted commands and required options. |

Tokens are 32 random bytes encoded as base64url. Only their SHA-256 hashes are persisted. The plaintext appears only in `create-adapter` and `rotate-adapter` output; list output never contains a token or hash. Every list and mutation is scoped by the supplied workspace UUID.

## Capture endpoint

`POST /v1/bank-email/captures` authenticates the adapter from `Authorization: Bearer <adapter token>`; it does not accept a workspace ID. The Bearer token must be a 32–512-character base64url value. The backend resolves its workspace from the active credential.

```http
POST /v1/bank-email/captures
Authorization: Bearer <plaintext token shown once at provisioning>
Content-Type: application/json
```

```json
{
  "eventId": "mailbox-message-2026-000042",
  "sender": "NotificacionBAC@baccredomatic.cr",
  "subject": "Notificación de transacción Example Store 17-11-2026 - 18:07",
  "body": "<synthetic BAC plain-text purchase email>",
  "receivedAt": "2026-11-17T18:08:00.000Z",
  "authentication": {
    "spf": "pass",
    "dkim": "pass",
    "dmarc": "pass",
    "domain": "baccredomatic.cr"
  }
}
```

A new accepted capture returns `201`; a repeat for the same workspace, channel, and `eventId` returns `200` with `duplicate: true` and no second capture, audit, or transaction.

```json
{
  "status": "registered",
  "duplicate": false,
  "transactionId": "<server transaction UUID>",
  "transaction": {
    "amount": "2.99",
    "currency": "USD",
    "concept": "Example Store",
    "paymentMethod": "card"
  }
}
```

### Acceptance limits and authentication evidence

| Field | Requirement |
|---|---|
| `eventId` | Non-empty text, maximum 512 characters; retain exactly one stable value across retries. |
| `sender` | Non-empty text, maximum 320 characters; BAC parsing requires the configured BAC sender. |
| `subject` | Non-empty text, maximum 998 characters; must match the strict BAC purchase subject. |
| `body` | Non-empty plain text, maximum 65,536 characters; must match the strict BAC purchase template. |
| `receivedAt` | Required ISO 8601 datetime. |
| `authentication` | Required exact object: SPF, DKIM, and DMARC must each be `pass`; `domain` must be `baccredomatic.cr` (case-insensitive), maximum 253 characters. |

Authentication evidence is adapter-supplied transport evidence, not a claim inferred from sender text. Values such as `fail`, `softfail`, `neutral`, `none`, `temperror`, and `permerror` fail closed.

| Status | Meaning | Adapter action |
|---:|---|---|
| `201` | New registered expense. | Treat as success. |
| `200` | Existing `(workspace, bank_email, eventId)` delivery. | Treat as idempotent success; retain the same `eventId`. |
| `401` | Missing, malformed, unknown, revoked, or unauthenticated credential/evidence. | Do not expose or retry with a different token. |
| `422` | Request limits, email format, timestamp, or validation failed. | Correct the adapter payload; do not invent a new `eventId` for the same delivery. |
| `503` | BAC template or enabled payment method is unavailable for the credential workspace. | Restore workspace provisioning, then retry with the same `eventId`. |

## Privacy and operations

The capture and audit records never persist or log the raw email body, customer name, location, masked card number, authorization value, reference, or plaintext Bearer token. They contain only fixed privacy-safe capture text, redacted processing metadata, template identifiers/version, authentication result, and a versioned SHA-256 audit hash. The registered expense intentionally persists the parsed amount, currency, merchant as its `concept`, and configured payment method because those are the financial transaction fields shown to the user.

If a token is exposed, revoke it immediately. Rotation both invalidates the prior credential and discloses its replacement only once; update the future adapter securely before its next request.

## Verification checklist

- [ ] `npm run bank-email:admin -- --help` lists create, list, revoke, rotate, and BAC assignment commands.
- [ ] The intended workspace has an enabled payment method before BAC assignment.
- [ ] The BAC assignment uses `bac_purchase` / `bac-email-v1` and the intended workspace only.
- [ ] A newly created token was copied once to the adapter and not logged, stored, or screenshotted.
- [ ] `list-adapters` contains neither plaintext tokens nor token hashes.
- [ ] The adapter supplies passing SPF, DKIM, and DMARC evidence for `baccredomatic.cr`.
- [ ] A retry preserves its `eventId` and receives the idempotent `200` response.
- [ ] Revocation or rotation is tested before relying on the credential.
