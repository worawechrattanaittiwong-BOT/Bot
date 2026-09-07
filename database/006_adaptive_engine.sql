UPDATE bot_settings
SET
  settings='{
    "adaptiveEngine":true,
    "riskPerOrderPercent":0.25,
    "hardStopAtrMultiplier":2.0,
    "atrPeriod":14,
    "confidenceThreshold":70,
    "sessionStartHour":0,
    "sessionEndHour":24,
    "maxAtrPoints":3000,
    "cooldownMinutesAfterLoss":15,
    "maxConsecutiveLosses":3
  }'::jsonb || settings,
  updated_at=now()
WHERE NOT settings ? 'adaptiveEngine';
