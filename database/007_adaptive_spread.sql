-- Preserve user choices and update only the previous untouched cooldown.
UPDATE bot_settings
SET settings=jsonb_set(settings,'{cooldownMinutesAfterLoss}','5'::jsonb,true),
    updated_at=now()
WHERE COALESCE((settings->>'cooldownMinutesAfterLoss')::int,15)=15;

-- maxSpreadPoints remains as a startup fail-safe. FastBasketBot 1.009 uses
-- rolling broker/account/symbol spread percentiles after warm-up.
