// Vercel's Fastify detector requires the entrypoint to import the framework directly.
import "fastify";

import { buildProductionApp } from "./bootstrap.js";
import { createPostgresDatabase } from "./infrastructure/database/node-postgres.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

// Vercel reuses this module between invocations, including its database pool.
const { db } = createPostgresDatabase(connectionString);
const app = buildProductionApp(db, { logger: true });

app.listen({ port: 3000 });
