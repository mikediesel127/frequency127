export async function onRequest(context) {
  const { env, request } = context;
  try {
    if (!env.DB) return j(500, { ok:false, error:'DB binding missing' });
    if (!env.JWT_SECRET) return j(401, { ok:false, error:'Not logged in' });

    const token = readCookie(request.headers.get('cookie') || '', 'f127');
    if (!token) return j(401, { ok:false, error:'Not logged in' });

    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload?.uid) return j(401, { ok:false, error:'Not logged in' });

    const u = await env.DB.prepare('SELECT id, username, created_at, xp FROM users WHERE id=?').bind(payload.uid).first();
    if (!u) return j(401, { ok:false, error:'Not logged in' });

    return j(200, { ok:true, user:{ id:u.id, username:u.username, xp:u.xp ?? 0, created_at:u.created_at } });
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
