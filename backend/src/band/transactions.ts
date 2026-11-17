import { eq, and, inArray } from "drizzle-orm";
import type { Transaction } from "../db";
import { bands, roleUsers, notifications, applications } from "../db/schema";
import { missing, forbidden, invalid } from "../shared/errors";
export async function lockBand(
  tx: Transaction,
  bandId: string,
  leaderId?: string,
) {
  const [band] = await tx
    .select()
    .from(bands)
    .where(eq(bands.id, bandId))
    .for("update");
  if (!band) return missing("Band tidak ditemukan.");
  if (leaderId && band.leaderId !== leaderId) forbidden();
  return band;
}
export async function requireRole(
  tx: Transaction,
  userId: string,
  roleId: string,
) {
  const [role] = await tx
    .select()
    .from(roleUsers)
    .where(and(eq(roleUsers.userId, userId), eq(roleUsers.roleId, roleId)))
    .for("share");
  if (!role) invalid("Peran harus sesuai dengan peran pada profil Anda.");
}
export async function rejectApplications(
  tx: Transaction,
  bandId: string,
  bandName: string,
  roleIds: string[],
) {
  if (!roleIds.length) return;
  const rejected = await tx
    .delete(applications)
    .where(
      and(
        eq(applications.bandId, bandId),
        inArray(applications.roleId, roleIds),
      ),
    )
    .returning();
  if (rejected.length)
    await tx.insert(notifications).values(
      rejected.map((application) => ({
        userId: application.userId,
        message: `Permohonan bergabung dengan ${bandName} ditolak karena posisi sudah tidak tersedia.`,
      })),
    );
}
