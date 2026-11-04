DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0003_payment_method_catalog') THEN
    CREATE TABLE payment_methods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      code text NOT NULL CONSTRAINT payment_methods_code_check CHECK (length(trim(code)) > 0),
      label text NOT NULL CONSTRAINT payment_methods_label_check CHECK (length(trim(label)) > 0),
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT payment_methods_workspace_code_uq UNIQUE (workspace_id, code),
      CONSTRAINT payment_methods_workspace_label_uq UNIQUE (workspace_id, label)
    );

    ALTER TABLE transactions
      ADD CONSTRAINT transactions_workspace_payment_method_fk
      FOREIGN KEY (workspace_id, payment_method)
      REFERENCES payment_methods (workspace_id, code)
      ON DELETE RESTRICT
      NOT VALID;

    INSERT INTO app_migrations (version) VALUES ('0003_payment_method_catalog');
  END IF;
END
$migration$;
