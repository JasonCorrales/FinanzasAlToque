DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0002_transaction_cancellation') THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('registered', 'pending_confirmation', 'cancelled'));

    INSERT INTO app_migrations (version) VALUES ('0002_transaction_cancellation');
  END IF;
END
$migration$;
