BEGIN;

UPDATE bot_settings
SET
  settings=jsonb_set(settings,'{maxSpreadPoints}','300'::jsonb,true),
  updated_at=now()
WHERE COALESCE(settings->>'symbol','') ILIKE 'XAUUSD%'
  AND COALESCE((settings->>'maxSpreadPoints')::int,50)=50;

COMMIT;
