BEGIN;

ALTER TABLE broker_partner_settings
  ADD COLUMN IF NOT EXISTS benefit_message text NOT NULL
  DEFAULT 'สมัครผ่านลิงก์ Partner ของ SCENOVA เพื่อรับราคาพิเศษและสิทธิประโยชน์เพิ่มเติมในระบบ SCENOVA';

COMMIT;
