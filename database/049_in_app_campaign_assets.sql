CREATE TABLE IF NOT EXISTS in_app_campaign_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES in_app_campaigns(id) ON DELETE CASCADE,
  asset_kind varchar(16) NOT NULL CHECK(asset_kind IN ('DESKTOP','MOBILE')),
  content_type varchar(64) NOT NULL,
  content bytea NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_campaign_asset_kind
  ON in_app_campaign_assets(campaign_id,asset_kind);
