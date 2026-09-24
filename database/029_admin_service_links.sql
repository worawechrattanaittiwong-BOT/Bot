CREATE TABLE IF NOT EXISTS admin_service_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  purpose varchar(220) NOT NULL DEFAULT '',
  url text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_service_links_name
  ON admin_service_links(lower(name));

CREATE INDEX IF NOT EXISTS idx_admin_service_links_updated
  ON admin_service_links(updated_at DESC);

INSERT INTO admin_service_links(name,purpose,url,note)
VALUES
  ('Hostinger','VPS / Server / Domain','https://hpanel.hostinger.com/','Production server และ domain'),
  ('Resend','Email API','https://resend.com/','Email verification / OTP / password reset'),
  ('ThaiBulkSMS','SMS / OTP API','https://www.thaibulksms.com/','SMS และ OTP สำหรับระบบ'),
  ('Opn / Omise','Payment API','https://dashboard.omise.co/','PromptPay / payment / webhook'),
  ('GitHub','Source / CI / Build','https://github.com/scenova-sketch/Bot','Repository และ GitHub Actions'),
  ('Let''s Encrypt','SSL Certificate','https://letsencrypt.org/','HTTPS certificate ผ่าน Certbot')
ON CONFLICT DO NOTHING;
