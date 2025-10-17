export async function onRequest() {
  return new Response(JSON.stringify({ ok:true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': 'f127=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'
    }
  });
}
