DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0009_bank_email_audit') THEN
    ALTER TABLE captures DROP CONSTRAINT IF EXISTS captures_channel_check;
    ALTER TABLE captures ADD CONSTRAINT captures_channel_check CHECK (
      channel IN ('telegram', 'bank_sms', 'bank_email')
      AND (
        channel <> 'bank_email'
        OR raw_message ~ '^bank_email:[a-z][a-z0-9_]*:result=(accepted|rejected)$'
      )
    );

    CREATE TABLE bank_email_capture_audits (
      capture_id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      message_hash text NOT NULL CONSTRAINT bank_email_capture_audits_hash_check CHECK (message_hash ~ '^sha256:v1:[a-f0-9]{64}$'),
      template_id uuid NOT NULL,
      template_version text NOT NULL CONSTRAINT bank_email_capture_audits_template_version_check CHECK (length(trim(template_version)) > 0),
      redacted_metadata text NOT NULL CONSTRAINT bank_email_capture_audits_redacted_metadata_check CHECK (length(trim(redacted_metadata)) > 0),
      authentication_result text NOT NULL CONSTRAINT bank_email_capture_audits_authentication_result_check CHECK (authentication_result IN ('passed', 'failed')),
      received_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT bank_email_capture_audits_workspace_capture_fk
        FOREIGN KEY (workspace_id, capture_id) REFERENCES captures (workspace_id, id) ON DELETE RESTRICT,
      CONSTRAINT bank_email_capture_audits_workspace_template_fk
        FOREIGN KEY (workspace_id, template_id) REFERENCES bank_email_templates (workspace_id, id) ON DELETE RESTRICT
    );

    INSERT INTO app_migrations (version) VALUES ('0009_bank_email_audit');
  END IF;
END
$migration$;
