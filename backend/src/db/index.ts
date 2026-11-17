import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../shared/config";
import * as schema from "./schema";
export const connection = postgres(config.databaseUrl, {
  max: 10,
  prepare: false,
});
export const db = drizzle(connection, { schema });
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
