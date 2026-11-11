DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0005_bank_sms_capture_audit') THEN
    ALTER TABLE captures DROP CONSTRAINT IF EXISTS captures_channel_check;
    ALTER TABLE captures ADD CONSTRAINT captures_channel_check CHECK (channel IN ('telegram', 'bank_sms'));

    CREATE TABLE bank_sms_capture_audits (
      capture_id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      message_hash text NOT NULL CONSTRAINT bank_sms_capture_audits_hash_check CHECK (message_hash ~ '^sha256:v1:[a-f0-9]{64}$'),
      template_id uuid NOT NULL REFERENCES bank_sms_templates(id) ON DELETE RESTRICT,
      template_version text NOT NULL CONSTRAINT bank_sms_capture_audits_template_version_check CHECK (length(trim(template_version)) > 0),
      credential_id uuid NOT NULL REFERENCES bank_sms_device_credentials(id) ON DELETE RESTRICT,
      received_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bank_sms_capture_audits_workspace_capture_fk
        FOREIGN KEY (workspace_id, capture_id) REFERENCES captures (workspace_id, id) ON DELETE RESTRICT
    );

    INSERT INTO app_migrations (version) VALUES ('0005_bank_sms_capture_audit');
  END IF;
END
$migration$;
