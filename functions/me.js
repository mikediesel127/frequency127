import { json, authUser, qall, q1 } from './_utils';

export async function onRequest(context){
  const {env} = context;
  const user = await authUser(context);
  if(!user) return json(401, {ok:false, error:'Not logged in'});
  const routines = await qall(env, `SELECT r.id, r.name, COALESCE(u.xp,0) as xp,
    (1 + CAST(COALESCE(u.xp,0)/100 as INT)) as level
    FROM routines r JOIN users u ON u.id=r.user_id WHERE r.user_id=? ORDER BY r.created_at DESC`, user.id);
  return json(200, {ok:true, user, routines});
}
