export async function onRequest(context) {
  const { env, request, params } = context;
  try {
    if (!env.DB) return J(500, { ok:false, error:'DB binding missing' });
    if (!env.JWT_SECRET) return J(500, { ok:false, error:'JWT secret missing' });

    const uid = await authUID(request, env.JWT_SECRET);
    if (!uid) return J(401, { ok:false, error:'Not logged in' });

    const id = params?.id;
    if (!id) return J(400, { ok:false, error:'Missing id' });

    const method = request.method.toUpperCase();

    if (method === 'GET') {
      const row = await env.DB.prepare(
        'SELECT id, user_id, name, time, steps, created_at FROM routines WHERE id=? AND user_id=?'
      ).bind(id, uid).first();
      if (!row) return J(404, { ok:false, error:'Not found' });

      // steps may be TEXT JSON; normalize
      let steps = [];
      try { steps = row.steps ? JSON.parse(row.steps) : []; } catch { steps = []; }

      return J(200, { ok:true, routine: {
        id: row.id, name: row.name, time: row.time ?? null, steps, created_at: row.created_at
      }});
    }

    if (method === 'PUT') {
      const ct = request.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return J(400, { ok:false, error:'Content-Type must be application/json' });
      const { name, time, steps } = await request.json();

      const exists = await env.DB.prepare('SELECT 1 FROM routines WHERE id=? AND user_id=?').bind(id, uid).first();
      if (!exists) return J(404, { ok:false, error:'Not found' });

      await env.DB.prepare(
        'UPDATE routines SET name=COALESCE(?,name), time=?, steps=? WHERE id=? AND user_id=?'
      ).bind(
        (typeof name === 'string' && name.trim()) ? name.trim() : null,
        (time ?? null),
        JSON.stringify(Array.isArray(steps) ? steps : []),
        id, uid
      ).run();

      return J(200, { ok:true });
    }

    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM routines WHERE id=? AND user_id=?').bind(id, uid).run();
      return J(200, { ok:true });
    }

    return J(405, { ok:false, error:'Method not allowed' });
  } catch (err) {
    console.error('routines/[id] error:', err);
    return J(500, { ok:false, error:'Server error' });
  }
}

/* utils shared inline */
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
