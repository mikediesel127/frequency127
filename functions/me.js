import { getUserFromJWT } from '../../_utils';

export async function onRequestGet(context) {
  try {
    const cookie = context.request.headers.get('Cookie') || '';
    const token = cookie.split('f127=')[1]?.split(';')[0];
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const user = await getUserFromJWT(token, context.env.JWT_SECRET);
    if (!user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });

    const { DB } = context.env;
    const { results } = await DB.prepare(
      'SELECT id, username, xp, streak, share_token FROM users WHERE id = ? LIMIT 1;'
    ).bind(user.uid).all();

    if (!results.length) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

    return new Response(JSON.stringify(results[0]), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error in /me:', err);
    return new Response(JSON.stringify({ error: 'Server error', detail: err.message }), { status: 500 });
  }
}
