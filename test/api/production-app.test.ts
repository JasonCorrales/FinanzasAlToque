import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { buildProductionApp } from "../../src/bootstrap.js";
import { applyMigrations } from "../../src/infrastructure/database/migrate.js";
import * as schema from "../../src/infrastructure/database/schema.js";

const clients: PGlite[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("production application composition", () => {
  it("exposes the capture endpoint with real repositories", async () => {
    const client = new PGlite();
    clients.push(client);
    await applyMigrations(client);
    const db = drizzle(client, { schema });
    let sequence = 0;
    const app = buildProductionApp(db, {
      logger: false,
      nextId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/captures",
      payload: {
        workspaceId: "10000000-0000-4000-8000-000000000001",
        externalMessageId: "telegram-production-1",
        channel: "telegram",
        message: "Gaste 15.000 colones en Gasolina pague con Tarjeta"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "pending_confirmation" });

    const decision = await app.inject({
      method: "POST",
      url: `/v1/transactions/${response.json().transactionId}/decision`,
      payload: {
        workspaceId: "10000000-0000-4000-8000-000000000001",
        action: "confirm"
      }
    });

    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toEqual({
      status: "registered",
      message: "Gasto confirmado: ₡15.000 CRC en Gasolina."
    });
    await app.close();
  });
});
