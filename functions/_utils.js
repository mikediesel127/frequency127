// Shared utils for Cloudflare Pages Functions (D1 + Auth)
export const json = (status, data = {}, init = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' }, ...init });

export const ok = (data={}) => json(200, { ok: true, ...data });
export const bad = (msg='Bad request', code=400) => json(code, { ok:false, error: msg });

export const uid = () => crypto.randomUUID();
export const now = () => Math.floor(Date.now()/1000);
export const dayKey = () => Math.floor(now()/86400);

const enc = new TextEncoder();
const b64url = ab => btoa(String.fromCharCode(...new Uint8Array(ab))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

export async function sha256(txt){ return crypto.subtle.digest('SHA-256', enc.encode(txt)); }
export async function hashPass(salt, pass){ return b64url(await sha256(salt + ':' + pass)); }
export async function verifyPass(salt, pass, hash){ return (await hashPass(salt, pass)) === hash; }

async function importHmac(secret, data){ return crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']); }
export async function signJWT(payload, secret){
  const header = b64url(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await importHmac(secret);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(header+'.'+body)));
  return `${header}.${body}.${sig}`;
}
export async function verifyJWT(token, secret){
  try{
    const [h,b,s] = token.split('.');
    const key = await importHmac(secret);
    const ok = await crypto.subtle.verify('HMAC', key,
      Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0)),
      new TextEncoder().encode(h+'.'+b));
    if(!ok) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0))));
  }catch{ return null; }
}

export async function parseBody(request){
  try{ return await request.json(); }catch{ return {}; }
}

export async function q1(env, sql, ...args){
  const stmt = env.DB.prepare(sql); const b = args.length? stmt.bind(...args) : stmt;
  return await b.first();
}
export async function qall(env, sql, ...args){
  const stmt = env.DB.prepare(sql); const b = args.length? stmt.bind(...args) : stmt;
  const {results} = await b.all(); return results||[];
}

export async function authUser(context){
  const {request, env} = context;
  const cookie = request.headers.get('cookie')||'';
  const token = (cookie.match(/f127=([^;]+)/)||[])[1];
  if(!token) return null;
  const data = await verifyJWT(token, env.JWT_SECRET||'dev');
  if(!data?.uid) return null;
  return await q1(env, 'SELECT id, username, xp, created_at FROM users WHERE id=?', data.uid);
}

export function setAuthCookie(token){
  const attrs = ['Path=/','HttpOnly','SameSite=Lax','Max-Age=1209600']; // 14 days
  return { 'set-cookie': `f127=${token}; ` + attrs.join('; ') };
}
