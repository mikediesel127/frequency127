export async function onRequest(context) {
  const { env, request } = context;
  try {
    if (request.method !== 'POST') return j(405, { ok:false, error:'Method not allowed' });
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return j(400, { ok:false, error:'Content-Type must be application/json' });

    const { username, passcode } = await request.json();
    if (!username || !/^\d{4}$/.test(String(passcode||''))) return j(400, { ok:false, error:'Bad credentials' });
    if (!env.DB) return j(500, { ok:false, error:'DB binding missing' });
    if (!env.JWT_SECRET) return j(500, { ok:false, error:'JWT_SECRET missing' });

    const u = await env.DB.prepare('SELECT id, username, salt, passhash FROM users WHERE username = ?').bind(username).first();
    if (!u) return j(401, { ok:false, error:'Invalid' });

    const passhash = await sha256(u.salt + String(passcode));
    if (passhash !== u.passhash) return j(401, { ok:false, error:'Invalid' });

    const token = await signJWT({ uid: u.id, u: u.username, iat: Date.now() }, env.JWT_SECRET);
    return new Response(JSON.stringify({ ok:true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie('f127', token, { httpOnly:true, sameSite:'Lax', path:'/', maxAge:60*60*24*14 })
      }
    });
  } catch (err) {
    console.error('auth-login error:', err);
    return j(500, { ok:false, error: String(err?.message || err) });
  }
}

/* utils */
function j(status, obj){return new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}})}
function cookie(name,value,{httpOnly=false,sameSite='Lax',path='/',maxAge}={}){const p=[`${name}=${value}`,`Path=${path}`,`SameSite=${sameSite}`];if(httpOnly)p.push('HttpOnly');if(typeof maxAge==='number')p.push(`Max-Age=${Math.floor(maxAge)}`);return p.join('; ')}
async function sha256(s){const e=new TextEncoder();const d=await crypto.subtle.digest('SHA-256',e.encode(s));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function signJWT(payload, secret){
  const enc = new TextEncoder();
  const header = b64u(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const body   = b64u(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64u(sig)}`;
}
function b64u(data){
  let str = (data instanceof ArrayBuffer)
    ? String.fromCharCode(...new Uint8Array(data))
    : btoa(String.fromCharCode(...new TextEncoder().encode(data)));
  if (!(data instanceof ArrayBuffer)) return str.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
