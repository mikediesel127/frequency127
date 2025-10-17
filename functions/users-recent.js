import { json, qall } from './_utils';
export async function onRequest(context){
  const {env} = context;
  const list = await qall(env, 'SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 10');
  return json(200,{ok:true, list});
}
