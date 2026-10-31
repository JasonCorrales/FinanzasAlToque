import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";

import type * as schema from "../database/schema.js";

export type FinanceDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
