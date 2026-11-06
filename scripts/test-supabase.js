// ทดสอบการเชื่อมต่อและตรวจเช็คตาราง Supabase
const fs = require('fs');
const path = require('path');

// อ่านค่าจาก .env ถ้ามี
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('กรุณาระบุ SUPABASE_URL และ SUPABASE_KEY ใน Environment Variables หรือ .env');
  process.exit(1);
}

const cleanUrl = url.replace(/\/+$/, '');

async function check() {
  console.log(`กำลังตรวจสอบการเชื่อมต่อกับ: ${cleanUrl}...`);
  try {
    const res = await fetch(`${cleanUrl}/rest/v1/dr_records?select=collection,id&limit=1`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (res.ok) {
      console.log('✅ ยอดเยี่ยม! ฐานข้อมูล Supabase และตาราง dr_records พร้อมใช้งาน 100% แล้ว!');
      const data = await res.json();
      console.log(`จำนวนข้อมูลปัจจุบันในตาราง: ${data.length} แถว`);
    } else {
      const txt = await res.text();
      if (res.status === 404 || txt.includes('does not exist')) {
        console.warn('⚠️ เชื่อมต่อได้ แต่ยังไม่พบตาราง "dr_records"');
      } else {
        console.error(`❌ ข้อผิดพลาดจาก Supabase (Status ${res.status}):`, txt);
      }
    }
  } catch (err) {
    console.error('❌ ไม่สามารถเชื่อมต่อกับ Supabase ได้:', err.message);
  }
}

check();
