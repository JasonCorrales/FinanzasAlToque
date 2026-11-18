DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0007_transaction_amount_scale') THEN
    ALTER TABLE transactions
      ALTER COLUMN amount TYPE numeric(20, 2)
      USING round(amount, 2);

    INSERT INTO app_migrations (version) VALUES ('0007_transaction_amount_scale');
  END IF;
END
$migration$;
