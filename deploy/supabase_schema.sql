-- ========================================================
-- DR Bus Body - Database Schema for Supabase
-- ใช้สำหรับจัดเก็บข้อมูลเอกสาร ลูกค้า งาน และผู้ใช้งานอย่างถาวร
-- นำโค้ดด้านล่างนี้ไปวางในเมนู SQL Editor ของ Supabase แล้วกด "Run"
-- ========================================================

CREATE TABLE IF NOT EXISTS dr_records (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (collection, id)
);

-- ปิด Row Level Security (RLS) เพื่อให้ Backend เข้าถึงได้โดยตรงผ่าน API Key
ALTER TABLE dr_records DISABLE ROW LEVEL SECURITY;

-- สร้าง Index เพื่อเพิ่มความเร็วในการดึงข้อมูลตาม collection
CREATE INDEX IF NOT EXISTS idx_dr_records_collection ON dr_records (collection);
