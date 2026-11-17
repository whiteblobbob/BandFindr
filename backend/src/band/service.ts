import { and, eq, exists, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  bands,
  users,
  bandRoles,
  roles,
  bandGenres,
  bandMembers,
} from "../db/schema";
import { invalid, missing } from "../shared/errors";
import { lockBand, requireRole, rejectApplications } from "./transactions";
export type Vacancy = { role_id: string; slot_left: number };
export type BandInput = {
  name: string;
  description?: string | null;
  genre_ids: string[];
  open_roles: Vacancy[];
  leader_role_id: string;
};
export type BandUpdate = Partial<Omit<BandInput, "leader_role_id">> & {
  is_open?: boolean;
};
export type BandQuery = {
  name?: string;
  genre?: string;
  is_open?: boolean;
  role?: string;
  limit?: number;
  offset?: number;
};
function validateVacancies(vacancies: Vacancy[]) {
  if (new Set(vacancies.map((v) => v.role_id)).size !== vacancies.length)
    invalid("Setiap peran hanya boleh dicantumkan sekali.");
}
const bandFields = {
  id: bands.id,
  name: bands.name,
  description: bands.description,
  is_open: bands.isOpen,
  logo_public_id: bands.logoPublicId,
  leader_id: bands.leaderId,
  leader: { name: users.name, profile_public_id: users.profilePublicId },
  province: users.province,
  city: users.city,
};
export const bandService = {
  async query(query: BandQuery, bandId?: string) {
    const items = await db
      .select(bandFields)
      .from(bands)
      .innerJoin(users, eq(users.id, bands.leaderId))
      .where(
        and(
          bandId ? eq(bands.id, bandId) : undefined,
          query.name
            ? ilike(bands.name, `%${query.name.replace(/[\\%_]/g, "\\$&")}%`)
            : undefined,
          query.is_open === undefined
            ? undefined
            : eq(bands.isOpen, query.is_open),
          query.genre
            ? exists(
                db
                  .select({ value: sql`1` })
                  .from(bandGenres)
                  .where(
                    and(
                      eq(bandGenres.bandId, bands.id),
                      eq(bandGenres.genreId, query.genre),
                    ),
                  ),
              )
            : undefined,
          query.role
            ? exists(
                db
                  .select({ value: sql`1` })
                  .from(bandRoles)
                  .where(
                    and(
                      eq(bandRoles.bandId, bands.id),
                      eq(bandRoles.roleId, query.role),
                    ),
                  ),
              )
            : undefined,
        ),
      )
      .orderBy(bands.id)
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);
    if (!items.length) return [];
    const vacancies = await db
      .select({
        band_id: bandRoles.bandId,
        role_id: roles.id,
        name: roles.name,
        slot_left: bandRoles.slotLeft,
      })
      .from(bandRoles)
      .innerJoin(roles, eq(roles.id, bandRoles.roleId))
      .where(
        inArray(
          bandRoles.bandId,
          items.map((b) => b.id),
        ),
      )
      .orderBy(roles.name);
    return items.map((band) => ({
      ...band,
      open_roles: vacancies
        .filter((v) => v.band_id === band.id)
        .map(({ band_id, ...role }) => role),
    }));
  },
  async fetch(id: string) {
    return (
      (await bandService.query({}, id))[0] ?? missing("Band tidak ditemukan.")
    );
  },
  async create(userId: string, body: BandInput) {
    validateVacancies(body.open_roles);
    const id = await db.transaction(async (tx) => {
      await requireRole(tx, userId, body.leader_role_id);
      const [band] = await tx
        .insert(bands)
        .values({
          name: body.name,
          description: body.description,
          leaderId: userId,
          isOpen: body.open_roles.length > 0,
        })
        .returning();
      await tx
        .insert(bandMembers)
        .values({ bandId: band!.id, userId, roleId: body.leader_role_id });
      if (body.genre_ids.length)
        await tx
          .insert(bandGenres)
          .values(
            body.genre_ids.map((genreId) => ({ bandId: band!.id, genreId })),
          );
      if (body.open_roles.length)
        await tx.insert(bandRoles).values(
          body.open_roles.map((v) => ({
            bandId: band!.id,
            roleId: v.role_id,
            slotLeft: v.slot_left,
          })),
        );
      return band!.id;
    });
    return bandService.fetch(id);
  },
  async update(id: string, userId: string, body: BandUpdate) {
    if (body.open_roles) validateVacancies(body.open_roles);
    await db.transaction(async (tx) => {
      const band = await lockBand(tx, id, userId);
      const previous = await tx
        .select()
        .from(bandRoles)
        .where(eq(bandRoles.bandId, id));
      if (body.open_roles) {
        const retained = new Set(body.open_roles.map((v) => v.role_id));
        await rejectApplications(
          tx,
          id,
          band.name,
          previous.filter((v) => !retained.has(v.roleId)).map((v) => v.roleId),
        );
        await tx.delete(bandRoles).where(eq(bandRoles.bandId, id));
        if (body.open_roles.length)
          await tx.insert(bandRoles).values(
            body.open_roles.map((v) => ({
              bandId: id,
              roleId: v.role_id,
              slotLeft: v.slot_left,
            })),
          );
      }
      if (body.genre_ids) {
        await tx.delete(bandGenres).where(eq(bandGenres.bandId, id));
        if (body.genre_ids.length)
          await tx
            .insert(bandGenres)
            .values(body.genre_ids.map((genreId) => ({ bandId: id, genreId })));
      }
      const hasVacancies = (body.open_roles ?? previous).length > 0;
      if (body.is_open === true && !hasVacancies)
        invalid("Tambahkan posisi terbuka sebelum membuka perekrutan.");
      await tx
        .update(bands)
        .set({
          name: body.name,
          description: body.description,
          isOpen: hasVacancies && (body.is_open ?? band.isOpen),
        })
        .where(eq(bands.id, id));
    });
    return bandService.fetch(id);
  },
};
