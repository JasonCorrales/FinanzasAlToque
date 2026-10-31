import { createPostgresDatabase } from "./node-postgres.js";
import { applyMigrations } from "./migrate.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const { pool } = createPostgresDatabase(connectionString);

try {
  await applyMigrations({
    async exec(migration) {
      await pool.query(migration);
    }
  });
} finally {
  await pool.end();
}
