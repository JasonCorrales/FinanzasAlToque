# Telegram Voice-Note Expense Capture

Accept short Telegram voice notes as expense input while reusing the existing text capture API and transaction flow.
Transcribe in n8n, require confirmation for voice-originated expenses, and avoid retaining audio.

## Specs

1. **S1** — “sigamos con el siguiente feature del proyecto Finanzas al toque”
2. **S2** — “OpenAI desde n8n (recomendado)”
3. **S3** — “Solo notas de voz, máximo 2 min (recomendado)”
4. **S4** — “Confirmar siempre (recomendado)”
5. **S5** — “Solo el texto transcripto (recomendado)”

## Tasks

- **T1** — S1-S5 — Add public-contract RED tests for voice-origin metadata, mandatory confirmation, transcript-only processing, and unchanged text behavior. Route: delegated writer (context backstop). Status: done (RED observed). Commit: `ddc4c6f`.
- **T2** — S4-S5 — Extend the capture contract minimally so voice-originated transcripts always require confirmation without storing audio or changing text capture policy. Route: inline. Status: done. Commit: `ddc4c6f`.
- **T3** — S2-S3, S5 — Extend both n8n Telegram workflow templates to reject voice notes over two minutes, download and transcribe accepted notes with OpenAI, preserve Telegram message idempotency, and reuse the existing capture/result paths. Route: delegated writer (context backstop). Status: done. Commit: `a8c271b`.
- **T4** — S1-S5 — Document setup, limits, privacy, and failure behavior; assess the diff and run focused, full, type, build, structural, and differential checks. Route: inline assessment + independent verifier. Status: done. Commit: `e28c0ae`.

## Log

- **L1** — “sigamos con el siguiente feature del proyecto Finanzas al toque”
- **L2** — Selected: “OpenAI desde n8n (recomendado)”.
- **L3** — Selected: “Solo notas de voz, máximo 2 min (recomendado)”.
- **L4** — Selected: “Confirmar siempre (recomendado)”.
- **L5** — Selected: “Solo el texto transcripto (recomendado)”.
- **L6** — T1 RED: `npm test -- test/api/captures.test.ts` exited 1 with 1 failed and 11 passed; a voice-originated transcript was incorrectly `registered` under the existing `never_confirm` Telegram policy instead of `pending_confirmation`. The unchanged text regression passed.
- **L7** — T2 GREEN: the capture API accepts optional `origin: "voice"`; voice transcripts force `pending_confirmation` while omitted/text origin still follows the existing Telegram policy. Focused API tests passed 12/12 and typecheck passed after accounting for exact optional property types.
- **L8** — T3 RED/GREEN: eight new structural workflow assertions initially failed. Both templates now route voice updates separately, reject durations over 120 seconds before download, download through Telegram File/Get, transcribe Spanish audio through the importable `@n8n/n8n-nodes-langchain.openAi` node, send only transcript plus `origin: "voice"`, preserve `message_id`, and use a voice-specific pre-API failure message. Focused workflow tests passed 14/14; JSON parsing and diff checks passed. Live n8n import/execution remains pending.
- **L9** — Review slice boundary: API contract and confirmation behavior are commit `ddc4c6f`; n8n voice routing/transcription is commit `a8c271b`. The branch reached 402 authored changed lines across these two reviewable behavior slices before the documentation/closure slice.
- **L10** — High-risk item 5 assessment requires writer self-verification plus an independent verifier because live n8n/OpenAI compatibility is environment-dependent. Focused API/workflow verification passed 26/26; build, typecheck, npm audit (0 vulnerabilities), JSON parsing, diff checks, and the text-capture differential check passed. The independent verifier passed S1-S5 structurally and reported live n8n import/execution with real credentials as unavailable.
- **L11** — Full `npm run check` did not complete: after 30 seconds the command timed out while `test/api/production-app.test.ts` reported one timeout/failure (`exposes the capture endpoint with real repositories`). The same focused production test passed 2/2 on an isolated `origin/main` baseline in 10.24 seconds, so current-branch production-composition proof remained unresolved. No automatic retry was performed.
- **L12** — After the user resumed the implementation, the previously blocked current-branch production-composition test passed 2/2 in 5.81 seconds. Full `npm run check` then passed: typecheck, 13/13 test files, 72/72 tests, and build. Workflow JSON parsing, `npm audit` (0 vulnerabilities), and `git diff --check` also passed. Live n8n import and OpenAI execution with real credentials remain unavailable in this environment.
