BEGIN;

-- Fleet Update jobs can remain WAITING_SAFE for hours or days. Pin the exact
-- EX5 bytes to the release row so a newer Production EA cannot invalidate an
-- older deferred job that is still waiting for the customer to stop safely.
ALTER TABLE ea_releases
  ADD COLUMN IF NOT EXISTS artifact_bytes bytea;

COMMIT;
