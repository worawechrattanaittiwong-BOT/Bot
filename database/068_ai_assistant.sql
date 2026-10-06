CREATE TABLE IF NOT EXISTS ai_assistant_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  provider varchar(32) NOT NULL DEFAULT 'INCEPTION',
  model varchar(120) NOT NULL DEFAULT 'mercury-2.5',
  daily_message_limit integer NOT NULL DEFAULT 30 CHECK (daily_message_limit BETWEEN 1 AND 1000),
  max_history_messages integer NOT NULL DEFAULT 12 CHECK (max_history_messages BETWEEN 2 AND 40),
  max_output_tokens integer NOT NULL DEFAULT 700 CHECK (max_output_tokens BETWEEN 128 AND 4000),
  system_note text NOT NULL DEFAULT '',
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_assistant_settings(id) VALUES(1) ON CONFLICT (id) DO NOTHING;
UPDATE ai_assistant_settings
SET provider='INCEPTION', model='mercury-2.5', updated_at=now()
WHERE id=1 AND provider='CUSTOM' AND btrim(model)='';

CREATE TABLE IF NOT EXISTS ai_support_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type varchar(24) NOT NULL UNIQUE CHECK (channel_type IN ('LINE','FACEBOOK','TELEGRAM','OTHER')),
  label varchar(80) NOT NULL,
  url text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ai_support_channels(channel_type,label,sort_order)
VALUES
  ('LINE','LINE',10),
  ('FACEBOOK','Facebook',20),
  ('TELEGRAM','Telegram',30)
ON CONFLICT (channel_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) NOT NULL UNIQUE,
  category varchar(48) NOT NULL,
  title varchar(180) NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_active_category
  ON ai_knowledge_articles(active,category,sort_order,title);

INSERT INTO ai_knowledge_articles(slug,category,title,content,sort_order)
VALUES
  ('system-scope','GENERAL','SCENOVA AI ขอบเขตการช่วยเหลือ',
   'SCENOVA AI เป็นผู้ช่วยแบบ Read-only สำหรับอธิบายการใช้งาน SCENOVA, MT5, EA, Broker, Trading Mode, การตั้งค่า, สถานะระบบ และความเสี่ยงของค่าที่ตั้ง ผู้ช่วยไม่มีสิทธิ์ Start/Stop บอท เปิด/ปิดออเดอร์ เปลี่ยนค่า EA หรือสั่งซื้อขายแทนผู้ใช้',10),
  ('mode-auto','AUTO','AUTO',
   'AUTO วิเคราะห์ทิศทางและจังหวะเข้าแบบ Adaptive Direction ใช้ Fixed Lot และจัดการเฉพาะ Position ที่ AUTO เปิดเอง ไม่รับช่วง Position จากโหมดอื่น ตลาด Sideway หรือกลับทิศถี่อาจเพิ่มความเสี่ยงของสัญญาณหลอก',20),
  ('mode-race','RACE','RACE',
   'RACE เน้นตาม Momentum และเพิ่มความถี่เพื่อให้ครบจำนวนสถานะที่ตั้งเร็วขึ้น ใช้ Fixed Lot และรองรับเป้ากำไรรายไม้หรือทั้ง Basket ความถี่สูงขึ้นทำให้ Exposure และการใช้ Margin เพิ่มเร็วขึ้นได้',30),
  ('mode-counter','COUNTER','COUNTER',
   'COUNTER ติดตามการไหลของราคาสั้น ราคาขึ้นเปิด BUY ราคาลงเปิด SELL แบ่งจำนวนไม้ BUY/SELL ตามค่าระบบ ปิดกำไรเป็นรายไม้และไม่มี Stop Loss จึงต้องระวังตลาดแกว่งกลับทิศถี่และ Floating Loss',40),
  ('mode-flip-lock','FLIP_LOCK','FLIP LOCK',
   'FLIP LOCK ถือ 1 Position ใช้ Fixed Lot มี Safety SL และเมื่อเข้าเงื่อนไขล็อกกำไรจะใช้ Trailing ตามราคาจริง หากชน SL ระบบสามารถกลับฝั่งตาม logic ของโหมด ตลาด Sideway แคบอาจทำให้กลับฝั่งถี่',50),
  ('mode-zero-grid','ZERO_GRID','ZERO GRID',
   'ZERO GRID วาง BUY STOP และ SELL STOP แบบสมมาตร 1-30 Level ต่อฝั่ง Lot เพิ่มตาม Level ค่า Base Lot ที่รองรับคือ 0.03, 0.06 และ 0.09 เช่น 0.06 จะเป็น 0.06, 0.12, 0.18 ต่อ Level การเพิ่ม Base Lot, เพิ่มจำนวน Level หรือใช้ระยะห่างที่แคบลงสามารถเพิ่ม Exposure และ Margin ที่ต้องใช้ได้มาก',60),
  ('mode-manual','MANUAL','MANUAL',
   'MANUAL ใช้สมองเข้าเดียวกับ AUTO แต่ผู้ใช้กำหนด Lot จำนวนไม้ Stop และ Profit เอง จึงต้องตรวจค่าก่อน Start ทุกครั้ง ค่า Lot หรือจำนวนไม้ที่สูงขึ้นเพิ่ม Exposure โดยตรง',70),
  ('mt5-ea-runtime','MT5','MT5 / EA / Runtime',
   'SCENOVA รองรับ Cloud และ Local Runtime สถานะ EA ใช้ Heartbeat เพื่อบอก Online/Offline หาก EA Offline ให้ตรวจ MT5, Chart ที่ติด EA, Algo Trading, การเชื่อมต่อ Broker และ Heartbeat ล่าสุด Safe Stop ใช้หยุดการเปิดรอบใหม่และจัดการสถานะค้างตาม logic ของระบบ',80),
  ('broker-exness','BROKER','Exness และ Broker',
   'การเชื่อม MT5 ต้องใช้ Account และ Server ให้ตรงกับข้อมูลจาก Broker เช่น Exness หาก Login ไม่ได้หรือ Server ไม่ตรงให้ตรวจข้อมูลจากแอปหรือพื้นที่ลูกค้าของ Broker SCENOVA ไม่ควรขอหรือแสดง Trading Password ผ่าน AI Chat',90),
  ('risk-basics','RISK','หลักการอ่านความเสี่ยง',
   'ความเสี่ยงเพิ่มได้จาก Lot สูงขึ้น จำนวน Position/Level มากขึ้น ระยะ Grid แคบลง Floating Loss สูง Drawdown สูง และ Margin ต่ำ AI อธิบายความเสี่ยงจากค่าปัจจุบันได้ แต่ไม่รับประกันผลตอบแทน ไม่ทำนายราคา และไม่ให้สัญญาณ BUY/SELL แทนผู้ใช้',100)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES license_slots(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL DEFAULT 'SCENOVA AI',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON ai_conversations(user_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('USER','ASSISTANT')),
  content text NOT NULL,
  provider varchar(32),
  model varchar(120),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON ai_messages(conversation_id,created_at,id);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,usage_date)
);
