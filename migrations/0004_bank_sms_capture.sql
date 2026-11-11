DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0004_bank_sms_capture') THEN
    CREATE TABLE bank_sms_device_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      device_label text NOT NULL CONSTRAINT bank_sms_device_credentials_label_check CHECK (length(trim(device_label)) > 0),
      token_hash text NOT NULL CONSTRAINT bank_sms_device_credentials_token_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz,
      revoked_at timestamptz,
      CONSTRAINT bank_sms_device_credentials_token_hash_uq UNIQUE (token_hash),
      CONSTRAINT bank_sms_device_credentials_state_check CHECK (
        (active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL)
      )
    );

    CREATE TABLE bank_sms_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      sender text NOT NULL CONSTRAINT bank_sms_templates_sender_check CHECK (sender ~ '^\+[1-9][0-9]{1,14}$'),
      body text NOT NULL CONSTRAINT bank_sms_templates_body_check CHECK (length(trim(body)) > 0),
      version text NOT NULL CONSTRAINT bank_sms_templates_version_check CHECK (length(trim(version)) > 0),
      payment_method text NOT NULL CONSTRAINT bank_sms_templates_payment_method_check CHECK (length(trim(payment_method)) > 0),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bank_sms_templates_workspace_version_uq UNIQUE (workspace_id, version)
    );

    CREATE UNIQUE INDEX bank_sms_templates_workspace_active_uq
      ON bank_sms_templates (workspace_id)
      WHERE active;

    INSERT INTO app_migrations (version) VALUES ('0004_bank_sms_capture');
  END IF;
END
$migration$;
