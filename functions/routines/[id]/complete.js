import { json, authUser, dayKey, now, q1 } from '../../_utils';

export async function onRequest(context){
  const {env, params} = context;
  const user = await authUser(context); if(!user) return json(401,{ok:false,error:'Not logged in'});
  const id = params.id;
  const key = dayKey();
  const exists = await q1(env, 'SELECT 1 FROM routine_completions WHERE user_id=? AND routine_id=? AND day_key=?', user.id, id, key);
  if(exists) return json(200,{ok:true, already:true});
  await env.DB.prepare('INSERT INTO routine_completions (user_id, routine_id, day_key, created_at) VALUES (?,?,?,?)')
    .bind(user.id, id, key, now()).run();
  await env.DB.prepare('UPDATE users SET xp = xp + 10 WHERE id=?').bind(user.id).run();
  return json(200,{ok:true, xp:+10});
}
