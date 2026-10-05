-- Repository owner migration: keep the Admin service link on the canonical repo.
UPDATE admin_service_links
SET url='https://github.com/worawechrattanaittiwong-BOT/Bot',
    note='Repository และ GitHub Actions',
    updated_at=now()
WHERE lower(name)='github'
  AND url IN (
    'https://github.com/SCENOVA-SNV/Bot',
    'https://github.com/SCENOVA-CPU/Bot',
    'https://github.com/scenova-lang/Bot',
    'https://github.com/scenova-sketch/Bot',
    'https://github.com/scenava-sys/Bot',
    'https://github.com/SCENOVA-EA/Bot',
    'https://github.com/SCENOVA-AI/Bot'
  );
