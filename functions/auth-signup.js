import { json, parseBody, uid, now, hashPass, q1 } from './_utils';

export async function onRequest(context){
  const {env, request} = context;
  if(request.method !== 'POST') return json(405, {ok:false, error:'Method not allowed'});
  const body = await parseBody(request);
  const {username, passcode} = body;
  if(!username || !passcode) return json(400, {ok:false, error:'Missing'});
  const exists = await q1(env, 'SELECT id FROM users WHERE username=?', username);
  if(exists) return json(409, {ok:false, error:'Username in use'});
  const id = uid(); const salt = uid().slice(0,8); const passhash = await hashPass(salt, passcode);
  await env.DB.prepare('INSERT INTO users (id, username, salt, passhash, xp, created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, username, salt, passhash, 0, now()).run();
  return json(200, {ok:true});
}
