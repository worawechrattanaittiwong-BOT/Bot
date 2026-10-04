# Broker Center — Phase 4

Phase 4 adds the Exness Partnership API connection and automation framework.

Official Exness Partner documentation confirms:
- authorization through `/api/auth`
- JWT authorization
- verification through `/api/partner/summary/`
- Partnership API access to partner reports and rebate functions

## Safety choices

SCENOVA does not hard-code undocumented report endpoints.

The official schema is account-accessible at:
`https://my.exnessaffiliates.com/api/schema/`

Owner/Admin must copy the exact client-report and commission-report paths from that schema.
Until those paths are configured, automatic report sync skips those resources safely.

## Credentials

Exness Partner email/password are encrypted using the existing Runtime Secrets vault:
- `EXNESS_PARTNER_EMAIL`
- `EXNESS_PARTNER_PASSWORD`

They are never returned to the browser after save.

## Automation

- Test Connection authenticates and checks `/api/partner/summary/`.
- Scheduled sync is disabled by default.
- Minimum interval is 5 minutes.
- Each run is audited in `broker_sync_runs`.
- Imported commission events remain idempotent through Phase 3 unique event IDs.
- Broker sync is outside the trading hot path.


## Auth field compatibility

The public help article documents partner email/password authentication but the
interactive schema is authoritative for request field names. SCENOVA therefore
allows Owner/Admin to choose `email` or `login` as the identity field before
testing the connection.

## External rebate payout

Phase 4 automates SCENOVA attribution, commission import and internal rebate release.
It does **not** guess or hard-code an undocumented Exness money-moving rebate endpoint.
Provider-side automatic rebate payout must only be enabled after the exact endpoint
and payload are confirmed in the authenticated official Exness schema.
