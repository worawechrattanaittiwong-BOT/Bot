CREATE TABLE IF NOT EXISTS access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  note text,
  created_by varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_groups_name_unique
  ON access_groups(lower(name));

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS access_group_id uuid REFERENCES access_groups(id) ON DELETE SET NULL;

ALTER TABLE trial_grants
  ADD COLUMN IF NOT EXISTS access_group_id uuid REFERENCES access_groups(id) ON DELETE SET NULL;

ALTER TABLE trial_authorizations
  ADD COLUMN IF NOT EXISTS access_group_id uuid REFERENCES access_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_access_group
  ON subscriptions(access_group_id) WHERE access_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trial_grants_access_group
  ON trial_grants(access_group_id) WHERE access_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trial_authorizations_access_group
  ON trial_authorizations(access_group_id) WHERE access_group_id IS NOT NULL;
