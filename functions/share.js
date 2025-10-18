import { json, requireAuth, uid } from "./_utils.js";

export const onRequestPost = async (c) => {
  const { env } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let tokenRow = await env.DB.prepare("SELECT share_token FROM users WHERE id = ?").bind(user.id).first();
  let share = tokenRow?.share_token;
  if (!share) {
    share = uid();
    await env.DB.prepare("UPDATE users SET share_token = ? WHERE id = ?").bind(share, user.id).run();
  }
  const url = new URL(c.request.url);
  url.pathname = "/"; // sharing homepage for now
  url.search = `?u=${share}`;
  return json({ url: url.toString() });
};
