export async function onRequest(context) {
  const { env, request } = context;
  try {
    if (!env.DB) return j(500, { ok:false, error:'DB binding missing' });
    if (!env.JWT_SECRET) return j(401, { ok:false, error:'Not logged in' });

    const cookies = request.headers.get('cookie') || '';
    // Accept either cookie name to be resilient during transition
    const token = readCookie(cookies, 'f127') || readCookie(cookies, 'auth');
    if (!token) return j(401, { ok:false, error:'Not logged in' });

    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload?.uid) return j(401, { ok:false, error:'Not logged in' });

    const u = await env.DB.prepare(
      'SELECT id, username, COALESCE(xp,0) AS xp, created_at FROM users WHERE id=?'
    ).bind(payload.uid).first();
    if (!u) return j(401, { ok:false, error:'Not logged in' });

    // Return routines as the UI expects: name, id, xp, level (fake level=1 if you don’t store it)
    const routines = await env.DB.prepare(
      'SELECT id, name, created_at FROM routines WHERE user_id=? ORDER BY created_at DESC'
    ).bind(u.id).all().then(r => r.results || []);

    const shaped = routines.map(r => ({
      id: r.id,
      name: r.name,
      xp: 0,       // if you don’t track per-routine xp yet
      level: 1     // basic default so UI doesn’t break
    }));

    return j(200, { ok:true, user: u, routines: shaped });
  } catch (err) {
    console.error('me error:', err);
    return j(401, { ok:false, error:'Not logged in' });
  }
}

/* ---------- utils ---------- */
function j(status, obj){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function readCookie(all, name){const m=all.match(new RegExp('(?:^|; )'+name+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}
async function verifyJWT(token, secret){
  const enc=new TextEncoder();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h,b,s] = parts;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, b64uToBuf(s), enc.encode(`${h}.${b}`));
  if (!ok) return null;
  try { return JSON.parse(atobUrl(b)); } catch { return null; }
}
function b64uToBuf(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';const bin=atob(str);return new Uint8Array([...bin].map(c=>c.charCodeAt(0))).buffer}
function atobUrl(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';return atob(str)}
