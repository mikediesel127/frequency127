export async function onRequest(context) {
  const { env, request } = context;
  try {
    if (request.method !== 'POST') return j(405, { ok:false, error:'Method not allowed' });
    if (!env.DB) return j(500, { ok:false, error:'DB binding missing' });
    if (!env.JWT_SECRET) return j(500, { ok:false, error:'JWT_SECRET missing' });

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return j(400, { ok:false, error:'Content-Type must be application/json' });

    const { username, passcode } = await request.json();
    if (!username || typeof username !== 'string' || !username.trim()) return j(400, { ok:false, error:'Username required' });
    if (!/^\d{4}$/.test(String(passcode || ''))) return j(400, { ok:false, error:'Passcode must be 4 digits' });

    const taken = await env.DB.prepare('SELECT 1 FROM users WHERE username=?').bind(username).first();
    if (taken) return j(409, { ok:false, error:'Username already taken' });

    const id = crypto.randomUUID();
    const salt = crypto.randomUUID().replace(/-/g,'');
    const passhash = await sha256(salt + String(passcode));

    await env.DB.prepare(
      'INSERT INTO users (id, username, salt, passhash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, username, salt, passhash, Date.now()).run();

    const token = await signJWT({ uid:id, u:username, iat:Date.now() }, env.JWT_SECRET);
    return new Response(JSON.stringify({ ok:true, id, username }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie('f127', token, { httpOnly:true, sameSite:'Lax', path:'/', maxAge: 60*60*24*14, secure:true })
      }
    });
  } catch (err) {
    console.error('auth-signup error:', err);
    return j(500, { ok:false, error: String(err?.message || err) });
  }
}

/* ---------- utils ---------- */
function j(status, obj){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function cookie(name,value,{httpOnly=false,sameSite='Lax',path='/',maxAge,secure=false}={}){
  const p=[`${name}=${value}`,`Path=${path}`,`SameSite=${sameSite}`];
  if (secure) p.push('Secure');
  if (httpOnly) p.push('HttpOnly');
  if (typeof maxAge==='number') p.push(`Max-Age=${Math.floor(maxAge)}`);
  return p.join('; ');
}
async function sha256(s){const e=new TextEncoder();const d=await crypto.subtle.digest('SHA-256',e.encode(s));return bufToHex(d)}
function bufToHex(ab){return [...new Uint8Array(ab)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function signJWT(payload, secret){
  const enc=new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body   = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}
function b64url(data){
  const b = (data instanceof ArrayBuffer)
    ? btoa(String.fromCharCode(...new Uint8Array(data)))
    : btoa(String.fromCharCode(...data));
  return b.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
