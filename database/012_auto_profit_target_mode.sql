UPDATE bot_settings
SET settings=jsonb_set(
      settings,
      '{profitTargetMode}',
      to_jsonb(
        CASE
          WHEN COALESCE((settings->>'basketProfitTargetMoney')::numeric,0)>0
            OR COALESCE((settings->>'perPositionProfitMoney')::numeric,0)>0
          THEN 'MANUAL'::text
          ELSE 'AUTO'::text
        END
      ),
      true
    ),
    updated_at=now()
WHERE NOT settings ? 'profitTargetMode';
