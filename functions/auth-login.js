import { json, parseBody, q1, verifyPass, signJWT, setAuthCookie } from './_utils';

export async function onRequest(context){
  const {env, request} = context;
  if(request.method !== 'POST') return json(405, {ok:false, error:'Method not allowed'});
  const body = await parseBody(request);
  const {username, passcode} = body;
  if(!username || !passcode) return json(400, {ok:false, error:'Missing'});
  const u = await q1(env, 'SELECT * FROM users WHERE username=?', username);
  if(!u) return json(401, {ok:false, error:'Invalid'});
  const ok = await verifyPass(u.salt, passcode, u.passhash);
  if(!ok) return json(401, {ok:false, error:'Invalid'});
  const token = await signJWT({uid:u.id, t:Date.now()}, env.JWT_SECRET||'dev');
  return new Response(JSON.stringify({ok:true}), {status:200, headers:{'content-type':'application/json', ...setAuthCookie(token)}});
}
