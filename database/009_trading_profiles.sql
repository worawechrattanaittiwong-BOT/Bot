UPDATE bot_settings
SET settings=(settings - 'cooldownMinutesAfterLoss' - 'maxConsecutiveLosses') ||
             jsonb_build_object(
               'tradingProfile',
               COALESCE(NULLIF(settings->>'tradingProfile',''),'BALANCED')
             ),
    updated_at=now()
WHERE settings ? 'cooldownMinutesAfterLoss'
   OR settings ? 'maxConsecutiveLosses'
   OR NOT settings ? 'tradingProfile';
