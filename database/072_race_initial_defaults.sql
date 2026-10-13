-- New RACE presets only. This updates the database column DEFAULT metadata;
-- it does not UPDATE existing bot_settings rows or live trading positions.
-- Keep this migration after 069_profit_target_defaults.sql, which still holds
-- older defaults and is replayed by the deployment script.
DO $$
DECLARE
  previous_default_expression text;
  new_default jsonb;
BEGIN
  SELECT pg_get_expr(d.adbin,d.adrelid)
    INTO previous_default_expression
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
    WHERE d.adrelid='public.bot_settings'::regclass AND a.attname='settings';
  IF previous_default_expression IS NULL THEN
    RAISE EXCEPTION 'bot_settings.settings has no existing DEFAULT';
  END IF;

  EXECUTE 'SELECT ' || previous_default_expression INTO new_default;
  IF jsonb_typeof(new_default) <> 'object' THEN
    RAISE EXCEPTION 'bot_settings.settings DEFAULT must be a JSON object';
  END IF;

  new_default := new_default || '{
    "raceLot":0.01,
    "raceMaxPositions":1,
    "raceProfitTargetMode":"BASKET",
    "raceCloseAllProfitEnabled":true,
    "raceCloseAllProfitMoney":2.0,
    "raceMaxBasketLossMoney":0,
    "raceDailyLossMoney":0,
    "raceDailyProfitTargetMoney":0
  }'::jsonb;

  EXECUTE format(
    'ALTER TABLE public.bot_settings ALTER COLUMN settings SET DEFAULT %L::jsonb',
    new_default::text
  );
END $$;
