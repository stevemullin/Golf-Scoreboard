import pg from "pg";
import fs from "fs";
const TABLES = ["tournaments","pool_members","golfers","golfer_scores","team_picks","manual_scores","api_cache","golfer_tiers","pick_submissions"];
const pool = new pg.Pool({ connectionString: process.env.SRC_URL, ssl: { rejectUnauthorized: false } });
const out = {};
for (const t of TABLES) {
  const { rows } = await pool.query(`SELECT * FROM ${t}`);
  out[t] = rows;
  console.log(`  ${t}: ${rows.length} rows`);
}
fs.writeFileSync(process.env.OUT_FILE, JSON.stringify(out));
console.log("snapshot written:", process.env.OUT_FILE);
await pool.end();
