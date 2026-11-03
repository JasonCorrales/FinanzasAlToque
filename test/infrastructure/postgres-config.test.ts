import { describe, expect, it } from "vitest";

import { resolvePostgresPoolConfig } from "../../src/infrastructure/database/node-postgres.js";

describe("resolvePostgresPoolConfig", () => {
  const connectionString = "postgres://user:password@db.example.com:6543/postgres";

  it("uses one connection and verified CA TLS on Vercel", () => {
    expect(
      resolvePostgresPoolConfig(connectionString, {
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_CA_CERT: "test-ca-certificate"
      })
    ).toEqual({
      connectionString,
      max: 1,
      ssl: { ca: "test-ca-certificate", rejectUnauthorized: true }
    });
  });

  it.each(["preview", "production"])(
    "fails clearly when the %s Vercel CA is not configured",
    (vercelEnvironment) => {
      expect(() =>
        resolvePostgresPoolConfig(connectionString, {
          VERCEL: "1",
          VERCEL_ENV: vercelEnvironment
        })
      ).toThrow("DATABASE_CA_CERT is required on Vercel");
    }
  );

  it("keeps local connections unmodified when no CA is supplied", () => {
    expect(resolvePostgresPoolConfig(connectionString, {})).toEqual({ connectionString });
  });
});
