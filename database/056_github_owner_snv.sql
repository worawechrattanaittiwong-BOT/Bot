-- Canonical GitHub owner migration for SCENOVA-SNV.
UPDATE admin_service_links
SET url='https://github.com/SCENOVA-SNV/Bot',
    note='Repository และ GitHub Actions',
    updated_at=now()
WHERE lower(name)='github'
  AND url <> 'https://github.com/SCENOVA-SNV/Bot';
