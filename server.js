// DR Bus Body - ระบบใบเสนอราคา / ใบวางบิล / ใบเสร็จรับเงิน
// ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้ Node.js 18 ขึ้นไปเท่านั้น
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// โหลดค่าจาก .env อัตโนมัติ (ถ้ามี)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

const PORT = process.env.PORT || 3000;
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'data.json');
const SECURE = process.env.COOKIE_SECURE === '1'; // ตั้งเป็น 1 เมื่อใช้ผ่าน https
const HOST = process.env.HOST || '0.0.0.0';       // ใช้ 127.0.0.1 เมื่อมี nginx อยู่ด้านหน้า
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // ตั้งเป็น 1 เมื่ออยู่หลัง nginx / Cloudflare / Render
const DAY = 86400000;

// การตั้งค่า Supabase (สำหรับรันบน Free Cloud เช่น Render หรือ Vercel)
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}

let DB = { docs: {}, customers: {}, jobs: {}, users: {}, company: {}, sessions: {}, files: {} };
let isLoaded = false;
let loadPromise = null;

// สำรองข้อมูลลง Local Disk (เมื่ออยู่ในสภาพแวดล้อมที่เขียนดิสก์ได้)
function persistLocal() {
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DB));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    // ข้ามเมื่อทำงานบนเซิร์ฟเวอร์แบบ Read-only หรือ Ephemeral
  }
}

// ซิงก์ข้อมูลไปยัง Supabase แบบ Asynchronous
async function persistRemote(collection, id, data, isDelete = false) {
  if (!USE_SUPABASE) return;
  try {
    if (isDelete) {
      await fetch(`${SUPABASE_URL}/rest/v1/dr_records?collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/dr_records`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          collection,
          id: String(id),
          data: data,
          updated_at: new Date().toISOString()
        })
      });
    }
  } catch (err) {
    console.error(`[Supabase] เกิดข้อผิดพลาดในการบันทึก ${collection}/${id}:`, err.message);
  }
}

// ฟังก์ชันรวมสำหรับบันทึกข้อมูล
function persist(collection, id, data, isDelete = false) {
  persistLocal();
  if (USE_SUPABASE && collection && id) {
    persistRemote(collection, id, data, isDelete);
  }
}

// โหลดข้อมูลเริ่มต้นจาก Local File หรือ Supabase
async function initDB() {
  if (isLoaded) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      // 1. โหลดข้อมูลเดิมจาก Local File ก่อน (ถ้ามี)
      try {
        if (fs.existsSync(FILE)) {
          DB = { ...DB, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
        }
      } catch (e) {}

      // 2. หากกำหนดค่า Supabase ไว้ ให้ดึงข้อมูลล่าสุดจาก Supabase
      if (USE_SUPABASE) {
        try {
          console.log('[Supabase] กำลังเชื่อมต่อกับฐานข้อมูลคลาวด์...');
          const res = await fetch(`${SUPABASE_URL}/rest/v1/dr_records?select=collection,id,data,updated_at`, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });
          if (res.ok) {
            const rows = await res.json();
            if (rows.length > 0) {
              for (const row of rows) {
                if (row.collection === 'company') {
                  DB.company = row.data || {};
                } else if (DB[row.collection]) {
                  const item = row.data;
                  if (item && typeof item === 'object') {
                    if (row.collection === 'docs' && !item.createdAt && row.updated_at) {
                      item.createdAt = row.updated_at;
                    }
                  }
                  DB[row.collection][row.id] = item;
                }
              }
              console.log(`[Supabase] โหลดข้อมูลเรียบร้อยแล้ว (${rows.length} รายการ)`);
            } else if (Object.keys(DB.users).length > 0) {
              // ฐานข้อมูลบน Supabase ยังว่างเปล่า แต่มีข้อมูลในเครื่อง นำข้อมูลขึ้น Supabase ให้อัตโนมัติ
              console.log('[Supabase] ฐานข้อมูลว่างเปล่า กำลังอัปโหลดข้อมูลจากในเครื่องขึ้น Supabase...');
              const batch = [];
              for (const col of ['docs', 'customers', 'jobs', 'users', 'sessions', 'files']) {
                for (const [id, val] of Object.entries(DB[col] || {})) {
                  batch.push({ collection: col, id, data: val, updated_at: new Date().toISOString() });
                }
              }
              if (DB.company && Object.keys(DB.company).length > 0) {
                batch.push({ collection: 'company', id: 'profile', data: DB.company, updated_at: new Date().toISOString() });
              }
              if (batch.length > 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/dr_records`, {
                  method: 'POST',
                  headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                  },
                  body: JSON.stringify(batch)
                });
                console.log(`[Supabase] อัปโหลดข้อมูลเริ่มต้นขึ้น Supabase แล้ว (${batch.length} รายการ)`);
              }
            }
          } else {
            console.error('[Supabase] ไม่สามารถดึงข้อมูลได้ (Status):', res.status, await res.text());
          }
        } catch (err) {
          console.error('[Supabase] ไม่สามารถเชื่อมต่อได้:', err.message);
        }
      }
      isLoaded = true;
    })();
  }
  return loadPromise;
}

const uid = () => crypto.randomBytes(8).toString('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const pub = u => ({ id: u.id, name: u.name, username: u.username, role: u.role });

function json(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 25e6) { req.destroy(); no(new Error('ไฟล์มีขนาดใหญ่เกินไป')); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
  });
}

function me(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = DB.sessions[m[1]];
  if (!s || s.exp < Date.now()) return null;
  return DB.users[s.uid] || null;
}

function startSession(res, user) {
  const t = crypto.randomBytes(32).toString('hex');
  const sess = { uid: user.id, exp: Date.now() + 30 * DAY };
  DB.sessions[t] = sess;
  persist('sessions', t, sess);
  for (const k of Object.keys(DB.sessions)) {
    if (DB.sessions[k].exp < Date.now()) {
      delete DB.sessions[k];
      persist('sessions', k, null, true);
    }
  }
  return { 'Set-Cookie': `sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SECURE ? '; Secure' : ''}` };
}

// จำกัดการเดารหัสผ่าน: ผิดเกิน 8 ครั้งใน 10 นาที จะถูกบล็อกชั่วคราว
const fails = {};
const blocked = ip => (fails[ip] || []).filter(t => t > Date.now() - 600000).length >= 8;
const fail = ip => { fails[ip] = (fails[ip] || []).filter(t => t > Date.now() - 600000).concat(Date.now()); };

const admins = () => Object.values(DB.users).filter(u => u.role === 'admin');
const isAdmin = u => u && u.role === 'admin';
const COL = { docs: 'docs', customers: 'customers', jobs: 'jobs', files: 'files' };

async function api(req, res, url) {
  const ip = TRUST_PROXY ? (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress;
  const u = me(req);
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const m = req.method, r = parts[1], id = parts[2];

  if (r === 'status' && m === 'GET')
    return json(res, 200, {
      setup: Object.keys(DB.users).length === 0,
      me: u ? pub(u) : null,
      storage: USE_SUPABASE ? 'supabase' : 'local'
    });

  if (r === 'setup' && m === 'POST') {
    if (Object.keys(DB.users).length) return json(res, 403, { error: 'ตั้งค่าแล้ว' });
    const b = await body(req);
    const username = String(b.username || '').trim().toLowerCase();
    if (!b.name || !username || String(b.password || '').length < 6) return json(res, 400, { error: 'กรอกให้ครบ และรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    const salt = uid(), nu = { id: uid(), name: String(b.name).trim(), username, role: 'admin', salt, hash: hashPw(b.password, salt) };
    DB.users[nu.id] = nu;
    persist('users', nu.id, nu);
    return json(res, 200, { me: pub(nu) }, startSession(res, nu));
  }

  if (r === 'login' && m === 'POST') {
    if (blocked(ip)) return json(res, 429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่' });
    const b = await body(req);
    const nu = Object.values(DB.users).find(x => x.username === String(b.username || '').trim().toLowerCase());
    if (!nu || !safeEq(hashPw(String(b.password || ''), nu.salt), nu.hash)) { fail(ip); return json(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }); }
    return json(res, 200, { me: pub(nu) }, startSession(res, nu));
  }

  if (r === 'logout' && m === 'POST') {
    const c = /sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
    if (c && DB.sessions[c[1]]) {
      delete DB.sessions[c[1]];
      persist('sessions', c[1], null, true);
    }
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
  }

  if (!u) return json(res, 401, { error: 'กรุณาเข้าสู่ระบบ' });

  if (r === 'state' && m === 'GET')
    return json(res, 200, {
      docs: Object.values(DB.docs), jobs: Object.values(DB.jobs), cust: Object.values(DB.customers), files: Object.values(DB.files || {}), co: DB.company,
      users: isAdmin(u) ? Object.values(DB.users).map(pub) : []
    });

  if (COL[r] && id) {
    const c = DB[COL[r]];
    if (m === 'PUT') {
      const b = await body(req);
      if (r === 'docs' && b.srcId && Object.values(c).some(x => x.id !== id && x.srcId === b.srcId && x.type === b.type))
        return json(res, 409, { error: 'ออกเอกสารจากใบต้นทางนี้ไปแล้ว ออกซ้ำไม่ได้' });
      b.id = id;
      if (r === 'docs' && !b.createdAt) {
        b.createdAt = (c[id] && c[id].createdAt) || new Date().toISOString();
      }
      c[id] = b;
      persist(COL[r], id, b);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (!isAdmin(u)) return json(res, 403, { error: 'เฉพาะแอดมิน' });
      delete c[id];
      persist(COL[r], id, null, true);
      return json(res, 200, { ok: true });
    }
  }

  if (r === 'company' && m === 'PUT') {
    if (!isAdmin(u)) return json(res, 403, { error: 'เฉพาะแอดมิน' });
    DB.company = await body(req);
    persist('company', 'profile', DB.company);
    return json(res, 200, { ok: true });
  }

  if (r === 'users' && id) {
    if (!isAdmin(u)) return json(res, 403, { error: 'เฉพาะแอดมิน' });
    if (m === 'PUT') {
      const b = await body(req);
      const old = DB.users[id];
      const username = String(b.username || '').trim().toLowerCase();
      const role = b.role === 'admin' ? 'admin' : 'user';
      if (!b.name || !username) return json(res, 400, { error: 'กรอกชื่อและชื่อผู้ใช้' });
      if (!old && String(b.password || '').length < 6) return json(res, 400, { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
      if (b.password && String(b.password).length < 6) return json(res, 400, { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
      if (Object.values(DB.users).some(x => x.username === username && x.id !== id)) return json(res, 400, { error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
      if (role !== 'admin' && !admins().some(x => x.id !== id)) return json(res, 400, { error: 'ต้องมีแอดมินอย่างน้อย 1 คน' });
      const nu = { ...(old || {}), id, name: String(b.name).trim(), username, role };
      if (b.password) { nu.salt = uid(); nu.hash = hashPw(String(b.password), nu.salt); }
      DB.users[id] = nu;
      if (b.password) {
        for (const k of Object.keys(DB.sessions)) {
          if (DB.sessions[k].uid === id && id !== u.id) {
            delete DB.sessions[k];
            persist('sessions', k, null, true);
          }
        }
      }
      persist('users', id, nu);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (id === u.id) return json(res, 400, { error: 'ลบตัวเองไม่ได้' });
      delete DB.users[id];
      persist('users', id, null, true);
      for (const k of Object.keys(DB.sessions)) {
        if (DB.sessions[k].uid === id) {
          delete DB.sessions[k];
          persist('sessions', k, null, true);
        }
      }
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    await initDB();
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const f = path.join(__dirname, 'public', 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' });
    const stream = fs.createReadStream(f);
    stream.on('error', () => { res.writeHead(404); res.end('Not Found'); });
    stream.pipe(res);
  } catch (e) {
    json(res, 400, { error: 'bad request' });
  }
});

module.exports = server;

if (require.main === module) {
  initDB().then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`DR Bus Body พร้อมใช้งานที่ http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
      console.log(`โหมดการจัดเก็บข้อมูล: ${USE_SUPABASE ? 'Supabase Cloud Database' : 'Local File (data/data.json)'}`);
    });
  });
}
