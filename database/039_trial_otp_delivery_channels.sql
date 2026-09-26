-- Trial/account OTP delivery channels.
-- Keeps the legacy trial_sms_codes table backward-compatible while allowing
-- email-first trial delivery and standalone account-phone verification.

ALTER TABLE trial_sms_codes
  ADD COLUMN IF NOT EXISTS purpose varchar(20) NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS delivery_channel varchar(16) NOT NULL DEFAULT 'SMS',
  ADD COLUMN IF NOT EXISTS email_masked varchar(320);

ALTER TABLE trial_sms_codes
  ALTER COLUMN phone_hash DROP NOT NULL,
  ALTER COLUMN phone_last4 DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trial_sms_purpose_user_created
  ON trial_sms_codes(purpose,user_id,created_at DESC);
