/**
 * One-off utility: clears all active flow sessions.
 * Run with:  node clear-flow-sessions.js
 * Use this when a chatbot flow gets "stuck" on the wrong node after code changes.
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DBHOST || "localhost",
      user: process.env.DBUSER || "root",
      password: process.env.DBPASS || "",
      database: process.env.DBNAME || "whatscrm",
      port: process.env.DBPORT || 3306,
    });

    const [result] = await conn.query("DELETE FROM flow_session");
    console.log(`✅ Cleared ${result.affectedRows} flow session(s). Flows will now restart fresh.`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to clear sessions:", err.message);
    process.exit(1);
  }
})();
