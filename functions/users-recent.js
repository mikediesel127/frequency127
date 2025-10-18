import { json } from "./_utils.js";

export const onRequestGet = async (c) => {
  const { env } = c;
  const recent = await env.DB.prepare("SELECT username FROM users ORDER BY created_at DESC LIMIT 20").all();
  return json(recent.results.map(r=>r.username));
};
