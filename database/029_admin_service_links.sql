CREATE TABLE IF NOT EXISTS admin_service_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  purpose varchar(220) NOT NULL DEFAULT '',
  url text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_service_links_name
  ON admin_service_links(lower(name));

CREATE INDEX IF NOT EXISTS idx_admin_service_links_updated
  ON admin_service_links(updated_at DESC);
