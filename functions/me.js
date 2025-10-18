export async function onRequest(context) {
  const { env, request } = context;
  if (!env.DB)  return J(500, { ok:false, error:'DB binding missing' });
  if (!env.JWT_SECRET) return J(401, { ok:false, error:'Not logged in' });

  const cookies = request.headers.get('cookie') || '';
  const token = readCookie(cookies, 'f127') || readCookie(cookies, 'auth');
  if (!token) return J(401, { ok:false, error:'Not logged in' });

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload?.uid) return J(401, { ok:false, error:'Not logged in' });

  const u = await env.DB
    .prepare('SELECT id, username, COALESCE(xp,0) AS xp, created_at FROM users WHERE id=?')
    .bind(payload.uid)
    .first();
  if (!u) return J(401, { ok:false, error:'Not logged in' });

  const rows = (await env.DB
    .prepare('SELECT id, name, created_at FROM routines WHERE user_id=? ORDER BY created_at DESC')
    .bind(u.id)
    .all()).results || [];

  const routines = rows.map(r => ({ id:r.id, name:r.name, xp:0, level:1 }));

  return J(200, { ok:true, user:u, routines });
}

/* utils */
function J(status, obj){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function readCookie(all, name){const m=all.match(new RegExp('(?:^|; )'+name+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}
async function verifyJWT(token, secret){
  const enc=new TextEncoder();
  const [h,b,s] = (token||'').split('.');
  if (!h||!b||!s) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const ok  = await crypto.subtle.verify('HMAC', key, b64urlToBuf(s), enc.encode(`${h}.${b}`));
  if (!ok) return null;
  try { return JSON.parse(atobUrl(b)); } catch { return null; }
}
function b64urlToBuf(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';const bin=atob(str);return new Uint8Array([...bin].map(c=>c.charCodeAt(0))).buffer}
function atobUrl(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';return atob(str)}
