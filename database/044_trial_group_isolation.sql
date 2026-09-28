-- Reserved compatibility migration.
-- Grouped subscription rows are converted safely in 045_access_group_grants.sql
-- so their temporary group duration can be separated from real membership time.
SELECT 1;
