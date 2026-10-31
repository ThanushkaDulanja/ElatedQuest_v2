export async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB
  `);
}

export async function getAppliedMigrations(connection) {
  const [rows] = await connection.execute(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  return rows.map((row) => row.version);
}

export async function executeMigration(connection, sql) {
  await connection.query(sql);
}

export async function recordMigration(connection, version) {
  await connection.execute(
    "INSERT INTO schema_migrations (version) VALUES (?)",
    [version],
  );
}
