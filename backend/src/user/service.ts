import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users, roleUsers, roles } from "../db/schema";
import { conflict, missing } from "../shared/errors";
export type ProfileUpdate = {
  name?: string;
  bio?: string | null;
  province?: string;
  city?: string;
  date_of_birth?: string;
  social_medias?: string[];
  role_ids?: string[];
};
export const userService = {
  async fetch(id: string) {
    const [user] = await db
      .select({
        id: users.id,
        is_profile_complete: users.isProfileComplete,
        name: users.name,
        bio: users.bio,
        profile_public_id: users.profilePublicId,
        province: users.province,
        city: users.city,
        social_medias: users.socialMedias,
      })
      .from(users)
      .where(eq(users.id, id));
    if (!user) return missing("Pengguna tidak ditemukan.");
    const userRoles = await db
      .select({ id: roles.id, name: roles.name })
      .from(roleUsers)
      .innerJoin(roles, eq(roles.id, roleUsers.roleId))
      .where(eq(roleUsers.userId, id))
      .orderBy(roles.name);
    return { ...user, roles: userRoles };
  },
  async complete(
    id: string,
    body: {
      name: string;
      province: string;
      city: string;
      date_of_birth: string;
    },
  ) {
    const { date_of_birth, ...fields } = body;
    const updated = await db
      .update(users)
      .set({
        ...fields,
        name: fields.name.trim(),
        province: fields.province.trim(),
        city: fields.city.trim(),
        dateOfBirth: date_of_birth,
        isProfileComplete: true,
      })
      .where(and(eq(users.id, id), eq(users.isProfileComplete, false)))
      .returning({ id: users.id });
    if (!updated.length) conflict("Profil sudah dilengkapi.");
    return userService.fetch(id);
  },
  async update(id: string, body: ProfileUpdate) {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, id))
        .for("no key update");
      if (!user) return missing("Pengguna tidak ditemukan.");
      const { role_ids, date_of_birth, social_medias, ...rest } = body;
      if (
        Object.keys(rest).length ||
        date_of_birth !== undefined ||
        social_medias !== undefined
      )
        await tx
          .update(users)
          .set({
            ...rest,
            dateOfBirth: date_of_birth,
            socialMedias: social_medias,
          })
          .where(eq(users.id, id));
      if (role_ids) {
        await tx.delete(roleUsers).where(eq(roleUsers.userId, id));
        await tx
          .insert(roleUsers)
          .values(role_ids.map((roleId) => ({ userId: id, roleId })));
      }
    });
    return userService.fetch(id);
  },
};
