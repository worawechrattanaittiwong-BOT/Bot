CREATE TABLE IF NOT EXISTS trading_mode_controls (
 mode varchar(24) PRIMARY KEY CHECK(mode IN ('AUTO','RACE','COUNTER','FLIP_LOCK','ZERO_GRID','MANUAL')),
 enabled boolean NOT NULL DEFAULT true,
 updated_by varchar(160),
 reason varchar(240),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO trading_mode_controls(mode,enabled)
SELECT m.mode,true FROM unnest(ARRAY['AUTO','RACE','COUNTER','FLIP_LOCK','ZERO_GRID','MANUAL']::varchar[]) AS m(mode)
ON CONFLICT(mode) DO NOTHING;
CREATE OR REPLACE FUNCTION canonical_mode_key(settings jsonb)
RETURNS varchar LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
   WHEN upper(coalesce(nullif(settings->>'controlMode',''),nullif(settings->>'engineMode',''),'AUTO'))='ASSISTED' THEN 'MANUAL'
   WHEN upper(coalesce(nullif(settings->>'controlMode',''),nullif(settings->>'engineMode',''),'AUTO'))
     IN ('AUTO','RACE','COUNTER','FLIP_LOCK','ZERO_GRID','MANUAL')
   THEN upper(coalesce(nullif(settings->>'controlMode',''),nullif(settings->>'engineMode',''),'AUTO'))
   ELSE 'AUTO'
 END::varchar
$$;
