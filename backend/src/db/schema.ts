import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  date,
  primaryKey,
  check,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey(),
  name: text().notNull(),
  bio: text(),
  profilePublicId: text("profile_public_id"),
  province: text().notNull(),
  city: text().notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  socialMedias: text("social_medias")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
});
export const roles = pgTable("roles", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull().unique(),
});
export const genres = pgTable("genres", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull().unique(),
});
export const roleUsers = pgTable(
  "role_users",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);
export const bands = pgTable(
  "bands",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    description: text(),
    isOpen: boolean("is_open").notNull().default(true),
    logoPublicId: text("logo_public_id"),
    leaderId: uuid("leader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("bands_leader_idx").on(t.leaderId)],
);
export const bandGenres = pgTable(
  "band_genres",
  {
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    genreId: uuid("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.bandId, t.genreId] })],
);
export const bandRoles = pgTable(
  "band_roles",
  {
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    slotLeft: integer("slot_left").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bandId, t.roleId] }),
    check("positive_slots", sql`${t.slotLeft} > 0`),
  ],
);
export const applications = pgTable(
  "applications",
  {
    id: uuid().defaultRandom().primaryKey(),
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
  },
  (t) => [
    unique("applications_band_user_unique").on(t.bandId, t.userId),
    index("applications_band_idx").on(t.bandId),
  ],
);
export const bandMembers = pgTable(
  "band_members",
  {
    bandId: uuid("band_id")
      .notNull()
      .references(() => bands.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
  },
  (t) => [primaryKey({ columns: [t.bandId, t.userId] })],
);
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text().notNull(),
    isRead: boolean("is_read").notNull().default(false),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);
