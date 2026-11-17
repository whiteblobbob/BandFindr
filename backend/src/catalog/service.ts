import { db } from "../db";
import { genres, roles } from "../db/schema";
export const catalogService = {
  roles: () => db.select().from(roles).orderBy(roles.name),
  genres: () => db.select().from(genres).orderBy(genres.name),
};
