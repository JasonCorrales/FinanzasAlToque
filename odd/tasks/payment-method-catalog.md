# Payment Method Catalog

Introduce a maintainable database catalog for payment methods and reject values outside that catalog.
Preserve the existing expense-capture flow while making the database the validation authority.

## Specs

1. **S1** — “me gustaría que los métodos de pago esten en un catalogo de la BD para que pueda darse mantenimiento posteriormente”
2. **S2** — “que el sistema valide contra esos valores y solo esos permita”
3. **S3** — “Me parece que falta la relación entre las tablas Transactions y Payment_methods para la columna Payment_method” / “a nivel de base de datos”
4. **S4** — “tambien falta en la tabla payment_method una columna id uuid PRIMARY KEY agregarla tambien”

## Tasks

- **T1** — S1 — Add the database-backed payment-method catalog and migration. Route: delegated writer. Status: done. Commit: `e127aac`.
- **T2** — S2 — Validate interpreted payment methods against the workspace catalog and wire persistence access into the application. Route: delegated writer. Status: done after correction. Commit: `e127aac`.
- **T3** — S1-S2 — Add public-interface regression coverage and update repository documentation. Route: delegated writer. Status: done after correction. Commit: `e127aac`.
- **T4** — S1-S2 — Run migration-risk verification, focused checks, full suite, and record evidence. Route: independent verifier + inline checks. Status: done. Commit: `e127aac`.
- **T5** — S3-S4 — Add the catalog UUID primary key and database-level composite transaction foreign key with historical-row-safe migration behavior. Route: delegated writer. Status: done. Commit: `bbb0ebb`.
- **T6** — S3-S4 — Verify migration compatibility, referential enforcement, full suite, and documentation. Route: independent verifier + inline checks. Status: done. Commit: `bbb0ebb`.

## Log

- **L1** — “estuve realizando pruebas y solo me permite indicar el metodo de pago "Tarjeta" y "Efectivo", me gustaría que los métodos de pago esten en un catalogo de la BD para que pueda darse mantenimiento posteriormente y que el sistema valide contra esos valores y solo esos permita”
- **L2** — “Catálogo vacío y carga manual”
- **L3** — Independent verification found that normalized code/label collisions could resolve nondeterministically and that the interpreter rejected the common form “Pagué 15.000 colones en Gasolina con Tarjeta”. T2-T4 were reopened for correction and re-verification.
- **L4** — Corrections now fail closed on normalized ambiguity and support both common and legacy Spanish phrasing, including concepts containing “con”. The full suite passed 58 tests; one combined verification command timed out after printing successful test and typecheck output, while `git diff --check` had passed separately.
- **L5** — Final independent verification passed S1 and S2. Its focused run passed 28 tests and typecheck; residual risk is that normalized catalog collisions are rejected at lookup time rather than prevented during catalog maintenance.
- **L6** — “Me parece que falta la relación entre las tablas Transactions y Payment_methods para la columna Payment_method”
- **L7** — “a nivel de base de datos”
- **L8** — “Por favor has ese ajuste y tambien falta en la tabla payment_method una columna id uuid PRIMARY KEY agregarla tambien”
- **L9** — Final independent verification passed S3 and S4. Persistence verification passed 13 tests and typecheck; no live Supabase migration was executed.
- **L10** — Review slices: `e127aac` implements the catalog and application validation; `bbb0ebb` independently adds the high-risk UUID primary key and database foreign-key correction.
