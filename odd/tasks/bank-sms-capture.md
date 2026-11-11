# Bank SMS capture
Implement automatic, workspace-scoped Coope Ande purchase capture from an iPhone Shortcut.
Security boundary: per-device Bearer credentials; raw bank messages and plaintext tokens must never be persisted.

## Specs
1. **S1 — Coope Ande source and parsing.** Accept the sender quoted by the user as `+506 6222-9581` (normalized to `+50662229581`) and the full-message format `Coope Ande le informa se ha realizado una Compra con su Tarjeta Debito {merchant} por {amount} colones`; parse amounts such as `5,300.00` into integer CRC and reject messages that do not match the configured full template.
2. **S2 — Automatic registration.** A valid bank SMS creates a registered expense directly with the workspace's configured `card` payment method; it must not use the conversational Spanish interpreter or require confirmation.
3. **S3 — Device authentication.** Honor `ok nos vamos a auntenticas con Bearer token distinto por dispositivo`: authenticate a dedicated endpoint with one strong Bearer token per device, persist only its hash, scope it to one workspace, and fail closed for missing, malformed, unknown, revoked, or cross-workspace credentials.
4. **S4 — Credential lifetime.** Honor `de acuerdo con que el token no expite hasta ser revocado.`: credentials have no automatic expiry and remain valid until revoked or rotated.
5. **S5 — Configurable templates and audit privacy.** Resolve a versioned declarative template per workspace, use `eventId` for idempotency, and persist only a redacted message, a versioned SHA-256 audit hash, and the applied template/version metadata; never persist the raw SMS or plaintext token.
6. **S6 — Administrative provisioning.** Provide an administrative script to create, list, revoke, and rotate device credentials and assign the Coope Ande template/payment method to a workspace; show plaintext tokens only once and never reveal stored token hashes in list output.
7. **S7 — iPhone pilot.** Honor `una notificación local del iPhone` and `perfecto me parece bien la idea de notificar tambien las compras exitosas para validar el flujo`: document the Shortcut request and secure token setup, with local notifications for both successful registrations and failures during the pilot.
8. **S8 — Existing behavior.** Preserve the existing Telegram text and voice-note capture behavior, workspace isolation, confirmation semantics, payment-method validation, deduplication, sanitized HTTP errors, and migration replay behavior.

## Tasks
- [x] **T1** — S1, S5 — Add strict template parser, amount normalization, redaction, and audit-hash primitives with RED/GREEN domain tests. Route: `gentle-ai-worker` (context backstop). Commit: `eb1e8e1`.
- [x] **T2** — S3-S6 — Add credential/template schema, migration, ports, and repositories with persistence and privacy tests. Route: `gentle-ai-worker` (context backstop). Commit: `92f6b50`. Risk: item 2 (device authentication secrets and workspace isolation).
- [x] **T3** — S2-S5, S8 — Add the direct bank-SMS capture use case with authentication, workspace isolation, idempotency, and automatic expense registration tests. Route: `gentle-ai-worker` (context backstop). Commit: `3f3239c`. Risk: item 2 (authentication and workspace boundary).
- [x] **T4** — S2-S5, S8 — Expose the dedicated Bearer-authenticated HTTP endpoint with public-contract and regression tests. Route: `gentle-ai-worker` (context backstop). Commit: `d36ae7e`. Risk: item 2 (HTTP authentication boundary).
- [x] **T5** — S3, S4, S6 — Add the administrative provisioning CLI and tests for create/list/revoke/rotate/assign behavior. Route: `gentle-ai-worker` (context backstop). Commit: `49ef66d`. Risk: item 2 (credential generation and disclosure).
- [x] **T6** — S7 — Document the iPhone Shortcut pilot, provisioning, secure token handling, notifications, revocation, and rotation. Route: `gentle-ai-worker` (context backstop). Commit: pending.
- [ ] **T7** — S1-S8 — Run full tests/build, differential regression checks where shared code changed, and independent security verification; close tracking evidence. Route: verifier for Risk item 2. Commit: pending.

## Log
- **L1** — `empecemos con la implementación`
- **L2** — `Solo tengo una tarjeta de Coope Ande y el remitente es siempre el mismo número de télefono: +506 6222-9581`
- **L3** — `una notificación local del iPhone`
- **L4** — `perfecto me parece bien la idea de notificar tambien las compras exitosas para validar el flujo`
- **L5** — `ok nos vamos a auntenticas con Bearer token distinto por dispositivo`
- **L6** — `de acuerdo con que el token no expite hasta ser revocado.`
- **L7** — `El remitente es un número telefonico: +506 6222-9581`
- **L8** — `listo! prepara lo necesario: el alcance, las tareas y las pruebas`
- **L9** — Delivery strategy: preserve work-unit commits as chained-PR-ready slices without publishing. Slice 1: `eb1e8e1` (T1). Slice 2: `92f6b50` (T2, smallest cohesive security persistence unit at 490 authored lines). Slice 3: `3f3239c` (T3, cohesive authentication, idempotency, redacted audit, and direct-registration behavior). Slice 4: `d36ae7e` (T4 HTTP boundary and production composition). Slice 5: `49ef66d` (T5 credential administration CLI).
