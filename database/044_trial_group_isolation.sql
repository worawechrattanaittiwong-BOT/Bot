-- Access groups are trial-campaign controls only.
-- Paid subscriptions must remain independent so deleting/closing a trial group
-- never changes real membership expiry or access.
UPDATE subscriptions
SET access_group_id=NULL
WHERE access_group_id IS NOT NULL;
