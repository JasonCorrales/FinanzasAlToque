import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

interface PostgresEnvironment {
  VERCEL?: string;
  VERCEL_ENV?: string;
  DATABASE_CA_CERT?: string;
}

export function resolvePostgresPoolConfig(
  connectionString: string,
  environment: PostgresEnvironment = process.env
): PoolConfig {
  const isVercel = environment.VERCEL === "1";
  const ca = environment.DATABASE_CA_CERT;

  if (isVercel && !ca) {
    throw new Error("DATABASE_CA_CERT is required on Vercel");
  }

  return {
    connectionString,
    ...(isVercel ? { max: 1 } : {}),
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {})
  };
}

export function createPostgresDatabase(connectionString: string) {
  const pool = new Pool(resolvePostgresPoolConfig(connectionString));
  const db = drizzle(pool, { schema });

  return { db, pool };
}
