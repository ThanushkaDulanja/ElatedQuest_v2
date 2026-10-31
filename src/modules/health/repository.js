import { pool } from "../../db/pool.js";

export async function checkDatabase() {
  await pool.execute("SELECT 1 AS healthy");
}
