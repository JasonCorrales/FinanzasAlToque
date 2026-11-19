DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0008_bank_email_capture') THEN
    CREATE TABLE bank_email_adapter_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      adapter text NOT NULL CONSTRAINT bank_email_adapter_credentials_adapter_check CHECK (length(trim(adapter)) > 0),
      token_hash text NOT NULL CONSTRAINT bank_email_adapter_credentials_token_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      revoked_at timestamptz,
      CONSTRAINT bank_email_adapter_credentials_token_hash_uq UNIQUE (token_hash),
      CONSTRAINT bank_email_adapter_credentials_state_check CHECK (
        (active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX bank_email_adapter_credentials_workspace_adapter_active_uq
      ON bank_email_adapter_credentials (workspace_id, adapter)
      WHERE active;

    CREATE TABLE bank_email_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      source text NOT NULL CONSTRAINT bank_email_templates_source_check CHECK (length(trim(source)) > 0),
      version text NOT NULL CONSTRAINT bank_email_templates_version_check CHECK (length(trim(version)) > 0),
      payment_method text NOT NULL CONSTRAINT bank_email_templates_payment_method_check CHECK (length(trim(payment_method)) > 0),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bank_email_templates_workspace_source_version_uq UNIQUE (workspace_id, source, version),
      CONSTRAINT bank_email_templates_workspace_id_uq UNIQUE (workspace_id, id),
      CONSTRAINT bank_email_templates_workspace_payment_method_fk
        FOREIGN KEY (workspace_id, payment_method) REFERENCES payment_methods (workspace_id, code) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX bank_email_templates_workspace_source_active_uq
      ON bank_email_templates (workspace_id, source)
      WHERE active;

    INSERT INTO app_migrations (version) VALUES ('0008_bank_email_capture');
  END IF;
END
$migration$;
