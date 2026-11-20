DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE version = '0010_bank_email_card_identity') THEN
    ALTER TABLE bank_email_templates ADD COLUMN IF NOT EXISTS institution text;
    ALTER TABLE bank_email_templates ADD COLUMN IF NOT EXISTS card_brand text;
    ALTER TABLE bank_email_templates ADD COLUMN IF NOT EXISTS card_last_four text;

    ALTER TABLE bank_email_templates DROP CONSTRAINT IF EXISTS bank_email_templates_card_identity_check;
    ALTER TABLE bank_email_templates ADD CONSTRAINT bank_email_templates_card_identity_check CHECK (
      (institution IS NULL AND card_brand IS NULL AND card_last_four IS NULL)
      OR (institution = 'BAC' AND card_brand = 'VISA' AND card_last_four ~ '^[0-9]{4}$')
    );

    INSERT INTO app_migrations (version) VALUES ('0010_bank_email_card_identity');
  END IF;
END
$migration$;
