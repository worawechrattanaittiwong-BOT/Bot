BEGIN;

-- Adaptive Spread no longer uses a fixed XAUUSD ceiling/floor.
UPDATE bot_settings
SET settings=jsonb_set(settings,'{maxSpreadPoints}','0'::jsonb,true),
    updated_at=now()
WHERE COALESCE((settings->>'adaptiveEngine')::boolean,true)=true
  AND COALESCE(settings->>'symbol','') ILIKE 'XAUUSD%'
  AND COALESCE((settings->>'maxSpreadPoints')::int,0) IN (50,300);

-- 3000 points was the old ATR hard-stop default. 0 now means fully adaptive:
-- ATR still changes lot, confidence, max positions and entry spacing.
UPDATE bot_settings
SET settings=jsonb_set(settings,'{maxAtrPoints}','0'::jsonb,true),
    updated_at=now()
WHERE COALESCE((settings->>'adaptiveEngine')::boolean,true)=true
  AND COALESCE((settings->>'maxAtrPoints')::numeric,0)=3000;

COMMIT;
