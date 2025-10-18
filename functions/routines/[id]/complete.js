export async function onRequest(context) {
  const { env, request, params } = context;
  try {
    if (!env.DB) return J(500, { ok:false, error:'DB binding missing' });
    if (!env.JWT_SECRET) return J(500, { ok:false, error:'JWT secret missing' });

    const uid = await authUID(request, env.JWT_SECRET);
    if (!uid) return J(401, { ok:false, error:'Not logged in' });

    const id = params?.id;
    if (!id) return J(400, { ok:false, error:'Missing id' });

    // Verify routine belongs to user
    const owns = await env.DB.prepare('SELECT 1 FROM routines WHERE id=? AND user_id=?').bind(id, uid).first();
    if (!owns) return J(404, { ok:false, error:'Not found' });

    // Award XP + record completion (id UUID-ish)
    const compId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO routine_completions (id, routine_id, user_id, created_at, xp_awarded) VALUES (?, ?, ?, ?, ?)'
    ).bind(compId, id, uid, Date.now(), 10).run();

    await env.DB.prepare('UPDATE users SET xp = COALESCE(xp,0) + 10 WHERE id=?').bind(uid).run();

    return J(200, { ok:true, awarded:10 });
  } catch (err) {
    console.error('routines/[id]/complete error:', err);
    return J(500, { ok:false, error:'Server error' });
  }
}

/* utils */
function J(status, obj){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function readCookie(all, name){const m=all.match(new RegExp('(?:^|; )'+name+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}
async function authUID(request, secret){
  const token = readCookie(request.headers.get('cookie') || '', 'f127') || readCookie(request.headers.get('cookie') || '', 'auth');
  if (!token) return null;
  const enc=new TextEncoder();
  const [h,b,s] = (token||'').split('.');
  if (!h||!b||!s) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const ok  = await crypto.subtle.verify('HMAC', key, b64urlToBuf(s), enc.encode(`${h}.${b}`));
  if (!ok) return null;
  try { const p = JSON.parse(atobUrl(b)); return p?.uid || null; } catch { return null; }
}
function b64urlToBuf(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';const bin=atob(str);return new Uint8Array([...bin].map(c=>c.charCodeAt(0))).buffer}
function atobUrl(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';return atob(str)}
