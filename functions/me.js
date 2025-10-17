export async function onRequest(context) {
  const { env, request } = context;
  try {
    if (!env.DB) return J(500, { ok:false, error:'E1:DB_BINDING_MISSING' });
    if (!env.JWT_SECRET) return J(401, { ok:false, error:'E1:JWT_SECRET_MISSING' });

    const cookies = request.headers.get('cookie') || '';
    const token = readCookie(cookies, 'f127') || readCookie(cookies, 'auth');
    if (!token) return J(401, { ok:false, error:'E2:TOKEN_MISSING' });

    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload?.uid) return J(401, { ok:false, error:'E3:VERIFY_FAIL' });

    let user;
    try {
      user = await env.DB.prepare(
        'SELECT id, username, COALESCE(xp,0) AS xp, created_at FROM users WHERE id=?'
      ).bind(payload.uid).first();
    } catch (e) {
      return J(500, { ok:false, error:'E4:USER_QUERY_THROW', detail:String(e) });
    }
    if (!user) return J(401, { ok:false, error:'E4:USER_NOT_FOUND', uid: payload.uid });

    let routines = [];
    try {
      const r = await env.DB.prepare(
        'SELECT id, name, created_at FROM routines WHERE user_id=? ORDER BY created_at DESC'
      ).bind(user.id).all();
      const rows = r?.results || [];
      routines = rows.map(row => ({ id: row.id, name: row.name, xp: 0, level: 1 }));
    } catch (e) {
      // Don’t fail the whole request if routines query is broken
      return J(200, { ok:true, user, routines: [], _dbg:'E5:ROUTINES_QUERY_THROW', detail:String(e) });
    }

    return J(200, { ok:true, user, routines, _dbg:'OK' });
  } catch (err) {
    console.error('me fatal error:', err);
    return J(401, { ok:false, error:'E0:UNCAUGHT', detail:String(err) });
  }
}

/* utils */
function J(status, obj){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function readCookie(all, name){const m=all.match(new RegExp('(?:^|; )'+name+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}
async function verifyJWT(token, secret){
  const enc=new TextEncoder();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h,b,s] = parts;

  // verify signature
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const sigOk = await crypto.subtle.verify('HMAC', key, b64urlToBuf(s), enc.encode(`${h}.${b}`));
  if (!sigOk) return null;

  // parse payload safely
  try { return JSON.parse(atobUrl(b)); } catch { return null; }
}
function b64urlToBuf(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';const bin=typeof atob==='function'?atob(str):Buffer.from(str,'base64').toString('binary');return new Uint8Array([...bin].map(c=>c.charCodeAt(0))).buffer}
function atobUrl(str){str=str.replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';return (typeof atob==='function'?atob(str):Buffer.from(str,'base64').toString('binary'))}
