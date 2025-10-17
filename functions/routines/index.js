import { json, parseBody, authUser, uid, now, qall } from '../_utils';

export async function onRequest(context) {
  const { env, request } = context;
  const user = await authUser(context);
  if (!user) return json(401, { ok:false, error:'Not logged in' });

  if (request.method === 'GET') {
    const list = await qall(
      env,
      'SELECT id, name, created_at FROM routines WHERE user_id=? ORDER BY created_at DESC',
      user.id
    );
    return json(200, { ok:true, list });
  }

  if (request.method === 'POST') {
    const body = await parseBody(request);
    const id = uid();
    await env.DB.prepare(
      'INSERT INTO routines (id, user_id, name, time, created_at) VALUES (?,?,?,?,?)'
    ).bind(id, user.id, body.name, body.time || null, now()).run();

    const steps = Array.isArray(body.steps) ? body.steps : [];
    for (let i = 0; i < steps.length; i++) {
      await env.DB.prepare(
        'INSERT INTO routine_steps (id, routine_id, ord, type, config) VALUES (?,?,?,?,?)'
      ).bind(uid(), id, i, steps[i].type, JSON.stringify(steps[i])).run();
    }
    return json(200, { ok:true, id });
  }

  return json(405, { ok:false, error:'Method not allowed' });
}
