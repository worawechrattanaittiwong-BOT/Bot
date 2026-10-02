-- Canonical GitHub owner migration for the primary owner account.
UPDATE admin_service_links
SET url='https://github.com/worawechrattanaitthiwong-creator/Bot',
    note='Repository และ GitHub Actions',
    updated_at=now()
WHERE lower(name)='github'
  AND url <> 'https://github.com/worawechrattanaitthiwong-creator/Bot';
