import { buildProductionApp } from "./bootstrap.js";
import { createPostgresDatabase } from "./infrastructure/database/node-postgres.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const { db, pool } = createPostgresDatabase(connectionString);
const app = buildProductionApp(db, { logger: true });
app.addHook("onClose", async () => {
  await pool.end();
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
