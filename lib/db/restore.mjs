// Restore the Neon snapshot into a fresh Postgres (Supabase). Assumes the
// schema was already created by migrate.mjs (the schema authority).
import pg from "pg";
import fs from "fs";
const ORDER = ["tournaments","pool_members","golfers","golfer_scores","team_picks","manual_scores","api_cache","golfer_tiers","pick_submissions"];
const data = JSON.parse(fs.readFileSync(process.env.SNAPSHOT, "utf8"));
const pool = new pg.Pool({ connectionString: process.env.DEST_URL, ssl: { rejectUnauthorized: false } });
const CHUNK = 200;
for (const t of ORDER) {
  const rows = data[t] || [];
  if (!rows.length) { console.log(`  ${t}: 0 rows (skip)`); continue; }
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of chunk) {
      values.push(`(${cols.map(() => `$${p++}`).join(",")})`);
      for (const c of cols) params.push(r[c]);
    }
    await pool.query(
      `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`,
      params,
    );
  }
  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${t}`);
  console.log(`  ${t}: restored, table now has ${count} rows (source ${rows.length})`);
}
await pool.end();
console.log("RESTORE COMPLETE");
