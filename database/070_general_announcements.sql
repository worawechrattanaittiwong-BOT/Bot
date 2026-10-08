-- Informational announcement only: never changes Maintenance or bot state.
CREATE TABLE IF NOT EXISTS system_announcements (
  id smallint PRIMARY KEY CHECK (id=1),
  title varchar(160) NOT NULL,
  message text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(120)
);
