CREATE TABLE IF NOT EXISTS app_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0001_initial') THEN
    CREATE TABLE captures (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      external_message_id text NOT NULL,
      channel text NOT NULL CONSTRAINT captures_channel_check CHECK (channel IN ('telegram')),
      raw_message text NOT NULL CONSTRAINT captures_raw_message_check CHECK (length(trim(raw_message)) > 0),
      status text NOT NULL CONSTRAINT captures_status_check CHECK (status IN ('received', 'processed', 'rejected')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT captures_workspace_id_uq UNIQUE (workspace_id, id)
    );

    CREATE UNIQUE INDEX captures_workspace_channel_message_uq
      ON captures (workspace_id, channel, external_message_id);

    CREATE TABLE confirmation_policies (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      channel text NOT NULL CONSTRAINT confirmation_policies_channel_check CHECK (channel IN ('telegram')),
      mode text NOT NULL CONSTRAINT confirmation_policies_mode_check
        CHECK (mode IN ('always_confirm', 'confidence_based', 'never_confirm')),
      confidence_threshold numeric(5, 4),
      version integer NOT NULL DEFAULT 1 CONSTRAINT confirmation_policies_version_check CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT confirmation_policies_threshold_check CHECK (
        (mode = 'confidence_based' AND confidence_threshold BETWEEN 0 AND 1)
        OR (mode <> 'confidence_based' AND confidence_threshold IS NULL)
      )
    );

    CREATE UNIQUE INDEX confirmation_policies_workspace_channel_uq
      ON confirmation_policies (workspace_id, channel);

    CREATE TABLE transactions (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      capture_id uuid NOT NULL,
      transaction_type text NOT NULL CONSTRAINT transactions_type_check CHECK (transaction_type = 'expense'),
      amount numeric(20, 6) NOT NULL CONSTRAINT transactions_amount_check CHECK (amount > 0),
      currency text NOT NULL CONSTRAINT transactions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
      concept text NOT NULL CONSTRAINT transactions_concept_check CHECK (length(trim(concept)) > 0),
      payment_method text NOT NULL CONSTRAINT transactions_payment_method_check CHECK (length(trim(payment_method)) > 0),
      status text NOT NULL CONSTRAINT transactions_status_check CHECK (status IN ('registered', 'pending_confirmation')),
      confidence numeric(5, 4) NOT NULL CONSTRAINT transactions_confidence_check CHECK (confidence BETWEEN 0 AND 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT transactions_workspace_capture_fk
        FOREIGN KEY (workspace_id, capture_id)
        REFERENCES captures (workspace_id, id)
        ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX transactions_capture_uq ON transactions (capture_id);

    INSERT INTO app_migrations (version) VALUES ('0001_initial');
  END IF;
END
$migration$;
