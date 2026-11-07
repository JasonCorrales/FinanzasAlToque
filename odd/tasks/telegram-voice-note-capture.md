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

- **T1** — S1-S5 — Add public-contract RED tests for voice-origin metadata, mandatory confirmation, transcript-only processing, and unchanged text behavior. Route: delegated writer (context backstop). Status: done (RED observed). Commit: pending.
- **T2** — S4-S5 — Extend the capture contract minimally so voice-originated transcripts always require confirmation without storing audio or changing text capture policy. Route: inline. Status: done. Commit: pending.
- **T3** — S2-S3, S5 — Extend both n8n Telegram workflow templates to reject voice notes over two minutes, download and transcribe accepted notes with OpenAI, preserve Telegram message idempotency, and reuse the existing capture/result paths. Route: inline. Status: in progress. Commit: pending.
- **T4** — S1-S5 — Document setup, limits, privacy, and failure behavior; assess the diff and run focused, full, type, build, structural, and differential checks. Route: inline assessment and checks. Status: pending. Commit: pending.

## Log

- **L1** — “sigamos con el siguiente feature del proyecto Finanzas al toque”
- **L2** — Selected: “OpenAI desde n8n (recomendado)”.
- **L3** — Selected: “Solo notas de voz, máximo 2 min (recomendado)”.
- **L4** — Selected: “Confirmar siempre (recomendado)”.
- **L5** — Selected: “Solo el texto transcripto (recomendado)”.
- **L6** — T1 RED: `npm test -- test/api/captures.test.ts` exited 1 with 1 failed and 11 passed; a voice-originated transcript was incorrectly `registered` under the existing `never_confirm` Telegram policy instead of `pending_confirmation`. The unchanged text regression passed.
- **L7** — T2 GREEN: the capture API accepts optional `origin: "voice"`; voice transcripts force `pending_confirmation` while omitted/text origin still follows the existing Telegram policy. Focused API tests passed 12/12 and typecheck passed after accounting for exact optional property types.
