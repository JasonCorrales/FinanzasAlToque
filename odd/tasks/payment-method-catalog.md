# Payment Method Catalog

Introduce a maintainable database catalog for payment methods and reject values outside that catalog.
Preserve the existing expense-capture flow while making the database the validation authority.

## Specs

1. **S1** — “me gustaría que los métodos de pago esten en un catalogo de la BD para que pueda darse mantenimiento posteriormente”
2. **S2** — “que el sistema valide contra esos valores y solo esos permita”

## Tasks

- **T1** — S1 — Add the database-backed payment-method catalog and migration. Route: delegated writer. Status: done. Commit: `e127aac`.
- **T2** — S2 — Validate interpreted payment methods against the workspace catalog and wire persistence access into the application. Route: delegated writer. Status: done after correction. Commit: `e127aac`.
- **T3** — S1-S2 — Add public-interface regression coverage and update repository documentation. Route: delegated writer. Status: done after correction. Commit: `e127aac`.
- **T4** — S1-S2 — Run migration-risk verification, focused checks, full suite, and record evidence. Route: independent verifier + inline checks. Status: done. Commit: `e127aac`.

## Log

- **L1** — “estuve realizando pruebas y solo me permite indicar el metodo de pago "Tarjeta" y "Efectivo", me gustaría que los métodos de pago esten en un catalogo de la BD para que pueda darse mantenimiento posteriormente y que el sistema valide contra esos valores y solo esos permita”
- **L2** — “Catálogo vacío y carga manual”
- **L3** — Independent verification found that normalized code/label collisions could resolve nondeterministically and that the interpreter rejected the common form “Pagué 15.000 colones en Gasolina con Tarjeta”. T2-T4 were reopened for correction and re-verification.
- **L4** — Corrections now fail closed on normalized ambiguity and support both common and legacy Spanish phrasing, including concepts containing “con”. The full suite passed 58 tests; one combined verification command timed out after printing successful test and typecheck output, while `git diff --check` had passed separately.
- **L5** — Final independent verification passed S1 and S2. Its focused run passed 28 tests and typecheck; residual risk is that normalized catalog collisions are rejected at lookup time rather than prevented during catalog maintenance.
