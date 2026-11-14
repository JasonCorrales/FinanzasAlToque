DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0006_finance_consultation_auth') THEN
    CREATE TABLE workspace_memberships (
      auth_user_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT workspace_memberships_auth_user_workspace_pk PRIMARY KEY (auth_user_id, workspace_id)
    );

    INSERT INTO app_migrations (version) VALUES ('0006_finance_consultation_auth');
  END IF;
END
$migration$;
