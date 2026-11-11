# Coope Ande iPhone Shortcut pilot

Use this guide to register Coope Ande card purchases from one iPhone. The Shortcut transmits each bank SMS transiently to the API and shows a local result notification. This is a pilot procedure, not evidence of a live deployment or a real-device test.

## Quick path

1. Provision the workspace template and a credential from an administrator machine.
2. Create a Message automation that accepts only `+506 6222-9581`.
3. Give each received SMS one stable `eventId`, then POST it to the bank-SMS endpoint.
4. Show the returned amount and concept locally for a `201` or `200`; show a generic local failure for other results.

## Before you start

Have all of the following ready:

- [ ] A deployed **HTTPS** API with its migrations already applied.
- [ ] The workspace UUID.
- [ ] An enabled `card` payment method in that workspace.
- [ ] Database access on the machine that will run the administrator command.
- [ ] The exact Coope Ande sender: `+506 6222-9581`.

The administrator CLI and endpoint are:

| Purpose | Value |
|---|---|
| Provision or manage credentials | `npm run bank-sms:admin -- --help` |
| Receive a bank SMS | `POST /v1/bank-sms/captures` |

## Provision one device

Run these commands from a checkout that can reach the target database. Substitute the workspace UUID and a recognizable per-device label.

```bash
export WORKSPACE_UUID="10000000-0000-4000-8000-000000000001"

# 1. Assign the fixed Coope Ande template to the enabled card method.
DATABASE_URL="postgres://..." npm run bank-sms:admin -- assign-coope-ande \
  --workspace "$WORKSPACE_UUID" \
  --payment-method card

# 2. Create a credential for this iPhone.
DATABASE_URL="postgres://..." npm run bank-sms:admin -- create-device \
  --workspace "$WORKSPACE_UUID" \
  --label "Maria iPhone"
```

The second command prints a credential ID and `token: <plaintext-token>`. Copy that plaintext token directly into the Shortcut configuration once. It is shown only at creation (and rotation), so do not place it in notes, screenshots, source control, or a notification.

Confirm the stored device metadata without exposing a secret:

```bash
DATABASE_URL="postgres://..." npm run bank-sms:admin -- list-devices \
  --workspace "$WORKSPACE_UUID"
```

`list-devices` returns device metadata such as ID, label, active state, and timestamps. It never returns a plaintext token or token hash.

## Build the Shortcut

Create a **Personal Automation** using the iPhone Shortcuts app. Configure its Message trigger to run **only** for messages from `+506 6222-9581`; do not use a broad “any sender” trigger. The following action flow is intentionally explicit so it can be reviewed on-device.

1. Get the received message text and retain it only in a Shortcut variable named `message`.
2. Generate an `eventId` once when this automation receives the SMS (for example, a UUID) and keep that same value if the Shortcut retries the request. Do not derive a new ID after a retry.
3. Keep the copied credential only in a Shortcut variable named `token`. Keep it out of notification text, logs, screenshots, and any other storage.
4. Use **Get Contents of URL** with the deployed URL plus `/v1/bank-sms/captures`:

   | Setting | Value |
   |---|---|
   | Method | `POST` |
   | Header | `Authorization: Bearer <token>` |
   | Request body | JSON |
   | URL | `https://<api-host>/v1/bank-sms/captures` |

5. Add these JSON fields. `receivedAt` is optional; when included it must be an ISO 8601 timestamp.

   ```json
   {
     "eventId": "<stable ID for this received SMS>",
     "sender": "+506 6222-9581",
     "message": "<received SMS text>",
     "receivedAt": "2026-03-12T14:30:00.000Z"
   }
   ```

The endpoint authenticates the device from the Bearer token and its workspace; do not send a workspace ID in the request.

## Pilot notifications

Branch on the HTTP status and keep notifications local to the iPhone.

| HTTP status | Meaning | Local notification |
|---|---|---|
| `201` | New expense registered | Success with the normalized `amount` + `currency` and `concept` from `transaction`. |
| `200` | Duplicate `eventId`; no second expense | Success/duplicate with the normalized `amount` + `currency` and `concept` from `transaction`. |
| `400`, `401`, `422`, `503`, `500` | Invalid input, unauthorized device, validation/configuration failure, unavailable service, or server failure | Generic failure. Do not display or store the token. |

For a success response, read `transaction.amount`, `transaction.currency`, and `transaction.concept` rather than re-parsing the SMS. A concise local notification is: `Registered: 5300 CRC — Super Mercado`. For failures, use a message such as `Bank purchase was not registered; check the Shortcut setup or try again.` Do not include the token, request headers, or raw SMS in failure text.

## Expected Coope Ande format

The assigned template is exactly:

```text
Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones
```

Use this sample message when checking the Shortcut mapping:

```text
Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito Super Mercado por 5,300.00 colones
```

A successful response must normalize it to **`5300 CRC`** and **`Super Mercado`**. Messages that do not exactly match the configured full template are rejected.

## Security and privacy

- Each device has its own credential, scoped to one workspace.
- A token has no automatic expiry: it remains valid until it is revoked or rotated.
- The Shortcut must use HTTPS. It necessarily sees the SMS and transmits it transiently to the API.
- The plaintext token is displayed once at creation or rotation. The backend stores a token hash, never the plaintext token.
- The backend stores a redacted SMS and a versioned audit hash, not the full raw SMS.

## Revoke, rotate, or disable

If the phone is lost, the automation is no longer approved, or the credential may be exposed, revoke it immediately:

```bash
DATABASE_URL="postgres://..." npm run bank-sms:admin -- revoke-device \
  --workspace "$WORKSPACE_UUID" \
  --credential "<credential UUID>"
```

To keep the device but replace its secret, rotate it:

```bash
DATABASE_URL="postgres://..." npm run bank-sms:admin -- rotate-device \
  --workspace "$WORKSPACE_UUID" \
  --credential "<credential UUID>" \
  --label "Maria iPhone"
```

Rotation prints a new plaintext token once and invalidates the old credential. Immediately replace the `token` value in the Shortcut; otherwise its next request receives `401`.

To roll back the pilot, first disable the Personal Automation in Shortcuts (or delete it), then revoke its device credential with the command above. This stops both automatic triggering and server acceptance. Do not leave a disabled Shortcut holding a token longer than necessary.

## Troubleshooting

| Symptom | Check | Action |
|---|---|---|
| No automation runs | Sender filter | Ensure the trigger is exactly `+506 6222-9581` and that Shortcuts is allowed to notify. |
| `401` failure notification | Credential | Check the device is active; after rotation, replace the Shortcut token. |
| `400` or `422` failure notification | Message and request fields | Keep the stable `eventId`, exact sender, and complete Coope Ande template text. |
| `503` or `500` failure notification | API availability | Verify the deployed HTTPS API and retry later with the same `eventId`. |
| Success notification says duplicate | Retry behavior | This is safe: the original `eventId` already registered the purchase. |
| Payment is rejected after authentication | Workspace provisioning | Confirm the Coope Ande template is assigned and the workspace `card` payment method is enabled. |

## Pilot verification checklist

- [ ] `npm run bank-sms:admin -- --help` lists the provisioning commands.
- [ ] The Coope Ande template was assigned to the intended workspace with payment method `card`.
- [ ] A separate credential was created for this iPhone and its plaintext token was copied only into the Shortcut.
- [ ] `list-devices` shows no plaintext token or token hash.
- [ ] The automation filters only `+506 6222-9581`.
- [ ] One received SMS produces one stable `eventId`; a retry retains that ID.
- [ ] The sample SMS yields a `201` success notification with `5300 CRC` and `Super Mercado`.
- [ ] Re-sending the same request yields `200` and a duplicate success notification without a second expense.
- [ ] A deliberate invalid request produces a local failure notification that does not reveal the token.
- [ ] Revocation or rotation is documented for the operator; a rotation includes the required Shortcut token update.
