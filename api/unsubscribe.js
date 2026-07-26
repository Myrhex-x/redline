import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "alerts not configured" });
  const { endpoint } = req.body ?? {};
  if (typeof endpoint !== "string" || endpoint.length > 1024) return res.status(400).end();
  const sql = neon(process.env.DATABASE_URL);
  await sql`DELETE FROM push_subs WHERE endpoint = ${endpoint}`;
  return res.status(204).end();
}
