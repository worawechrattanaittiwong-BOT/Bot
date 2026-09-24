-- Repository owner migration: keep existing private Admin service link current.
UPDATE admin_service_links
SET url='https://github.com/scenova-sketch/Bot',
    note='Repository และ GitHub Actions',
    updated_at=now()
WHERE lower(name)='github'
  AND url IN (
    'https://github.com/scenava-sys/Bot',
    'https://github.com/SCENOVA-EA/Bot',
    'https://github.com/SCENOVA-AI/Bot'
  );
