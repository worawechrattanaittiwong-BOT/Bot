-- Repository owner migration: keep existing private Admin service link current.
UPDATE admin_service_links
SET url='https://github.com/worawechrattanaitthiwong-creator/Bot',
    note='Repository และ GitHub Actions',
    updated_at=now()
WHERE lower(name)='github'
  AND url IN (
    'https://github.com/SCENOVA-CPU/Bot',
    'https://github.com/scenova-lang/Bot',
    'https://github.com/scenova-sketch/Bot',
    'https://github.com/scenava-sys/Bot',
    'https://github.com/SCENOVA-EA/Bot',
    'https://github.com/SCENOVA-AI/Bot',
    'https://github.com/SCENOVA-SNV/Bot'
  );
