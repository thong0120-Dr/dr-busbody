# DR Bus Body — ระบบใบเสนอราคา / ใบวางบิล / ใบเสร็จรับเงิน

ระบบออกเอกสารสำหรับ ห้างหุ้นส่วนจำกัด ดีอาร์.บัสบอดี้ ทำงานด้วย Node.js 18 ขึ้นไปโดยไม่ต้องติดตั้ง dependencies เพิ่มเติม (Zero dependencies) รองรับทั้งการรันในเครื่องตัวเอง (Local), เซิร์ฟเวอร์ส่วนตัว (VPS), หรือโฮสต์ฟรีบนคลาวด์ (Render / Vercel ร่วมกับ Supabase)

---

## 1) ทดลองบนเครื่องตัวเอง (Local)
```bash
node server.js
```
เปิดเบราว์เซอร์ที่ http://localhost:3000 — ครั้งแรกจะให้สร้างบัญชีแอดมิน  
จากนั้นเข้าเมนู "ผู้ใช้งาน" เพื่อเพิ่มพนักงาน  
ตั้งพอร์ตเองได้ด้วย: `PORT=8080 node server.js`

---

## 2) ติดตั้งบน Free Cloud Host (Render / Vercel + Supabase)

โฮสต์คลาวด์ฟรี (เช่น Render หรือ Vercel) จะรีเซ็ตดิสก์ทุกครั้งที่ระบบรีสตาร์ต เพื่อให้ข้อมูลใบเสนอราคาและลูกค้าไม่สูญหาย ระบบรองรับการเชื่อมต่อกับ **Supabase (ฟรีตลอดชีพ)**

### ขั้นตอนการเชื่อมต่อ Supabase:
1. สมัครใช้งานฟรีที่ [supabase.com](https://supabase.com) แล้วกด **New Project**
2. ไปที่เมนู **SQL Editor** วางโค้ดจากไฟล์ `deploy/supabase_schema.sql` แล้วกด **Run**
3. ไปที่ **Project Settings** > **API** เพื่อคัดลอก:
   - `Project URL` (นำไปใส่ในตัวแปร `SUPABASE_URL`)
   - `Project API keys` (service_role หรือ anon นำไปใส่ในตัวแปร `SUPABASE_KEY`)

### ตัวแปรสภาพแวดล้อม (Environment Variables) บน Render / Vercel:
| ตัวแปร | ค่าที่ต้องระบุ | คำอธิบาย |
| :--- | :--- | :--- |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | URL ของ Supabase Project |
| `SUPABASE_KEY` | `eyJhbGciOi...` | Key สำหรับอ่าน-เขียนฐานข้อมูล |
| `COOKIE_SECURE` | `1` | เปิดความปลอดภัยคุกกี้เมื่อใช้งานผ่าน HTTPS |
| `TRUST_PROXY` | `1` | ตรวจจับ IP ผู้ใช้งานจริงผ่าน Proxy/CDN |

---

## 3) ติดตั้งบนเซิร์ฟเวอร์แบบเดิม (VPS / โฮสติ้งส่วนตัว)
1. อัปโหลดโฟลเดอร์นี้ทั้งหมดขึ้นเซิร์ฟเวอร์ (ต้องมี Node.js 18+)
2. รันให้ทำงานตลอดเวลาด้วย pm2:
   ```bash
   npm i -g pm2
   HOST=127.0.0.1 PORT=3000 COOKIE_SECURE=1 TRUST_PROXY=1 pm2 start server.js --name drbusbody
   pm2 save && pm2 startup
   ```
3. ตั้งค่า nginx (ดูไฟล์ `deploy/nginx.conf`) เพื่อทำ Reverse Proxy และเปิดใช้งาน HTTPS

---

## 4) ข้อมูลและการสำรองข้อมูล (Data & Backup)
- **โหมด Local / VPS:** ข้อมูลจัดเก็บที่ไฟล์ `data/data.json`
- **โหมด Supabase Cloud:** ข้อมูลจัดเก็บในตาราง `dr_records` บน Supabase โดยอัตโนมัติแบบเรียลไทม์ พร้อมสำรองสำเนาลงไฟล์ `data/data.json` ในเครื่องเมื่อมีโอกาส
