-- Canonical GitHub owner migration for worawechrattanaittiwong-BOT.
UPDATE admin_service_links
SET url='https://github.com/worawechrattanaittiwong-BOT/Bot',
    note='Repository และ GitHub Actions',
    updated_at=now()
WHERE lower(name)='github'
  AND url <> 'https://github.com/worawechrattanaittiwong-BOT/Bot';
