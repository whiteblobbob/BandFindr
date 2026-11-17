import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  applications,
  bandRoles,
  bandMembers,
  bands,
  notifications,
} from "../db/schema";
import { conflict, forbidden, missing } from "../shared/errors";
import {
  lockBand,
  requireRole,
  rejectApplications,
} from "../band/transactions";
const fields = {
  id: applications.id,
  band_id: applications.bandId,
  user_id: applications.userId,
  role_id: applications.roleId,
};
export const applicationService = {
  async create(bandId: string, userId: string, roleId: string) {
    return db.transaction(async (tx) => {
      const band = await lockBand(tx, bandId);
      if (!band.isOpen) conflict("Perekrutan band sudah ditutup.");
      await requireRole(tx, userId, roleId);
      const [vacancy] = await tx
        .select()
        .from(bandRoles)
        .where(and(eq(bandRoles.bandId, bandId), eq(bandRoles.roleId, roleId)));
      if (!vacancy) conflict("Posisi sudah tidak tersedia.");
      const [member] = await tx
        .select()
        .from(bandMembers)
        .where(
          and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)),
        );
      if (member) conflict("Anda sudah menjadi anggota band ini.");
      const [application] = await tx
        .insert(applications)
        .values({ bandId, userId, roleId })
        .returning(fields);
      return application;
    });
  },
  async fetch(id: string, userId: string) {
    const [result] = await db
      .select({ application: fields, leaderId: bands.leaderId })
      .from(applications)
      .innerJoin(bands, eq(bands.id, applications.bandId))
      .where(eq(applications.id, id));
    if (!result) return missing("Permohonan tidak ditemukan.");
    if (result.application.user_id !== userId && result.leaderId !== userId)
      forbidden();
    return result.application;
  },
  async list(bandId: string, userId: string, limit = 20, offset = 0) {
    const [band] = await db.select().from(bands).where(eq(bands.id, bandId));
    if (!band) return missing("Band tidak ditemukan.");
    if (band.leaderId !== userId) forbidden();
    return db
      .select(fields)
      .from(applications)
      .where(eq(applications.bandId, bandId))
      .orderBy(applications.id)
      .limit(limit)
      .offset(offset);
  },
  async decide(id: string, userId: string, accept: boolean) {
    const [candidate] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));
    if (!candidate) return missing("Permohonan tidak ditemukan.");
    await db.transaction(async (tx) => {
      const band = await lockBand(tx, candidate.bandId, userId);
      const [application] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id));
      if (!application) return missing("Permohonan sudah diproses.");
      if (accept) {
        if (!band.isOpen)
          conflict("Buka perekrutan sebelum menerima permohonan.");
        await requireRole(tx, application.userId, application.roleId);
        const [vacancy] = await tx
          .select()
          .from(bandRoles)
          .where(
            and(
              eq(bandRoles.bandId, band.id),
              eq(bandRoles.roleId, application.roleId),
            ),
          );
        if (!vacancy) conflict("Posisi sudah tidak tersedia.");
        await tx.insert(bandMembers).values({
          bandId: band.id,
          userId: application.userId,
          roleId: application.roleId,
        });
        await tx.delete(applications).where(eq(applications.id, id));
        if (vacancy.slotLeft === 1) {
          await tx
            .delete(bandRoles)
            .where(
              and(
                eq(bandRoles.bandId, band.id),
                eq(bandRoles.roleId, application.roleId),
              ),
            );
          await rejectApplications(tx, band.id, band.name, [
            application.roleId,
          ]);
        } else {
          await tx
            .update(bandRoles)
            .set({ slotLeft: vacancy.slotLeft - 1 })
            .where(
              and(
                eq(bandRoles.bandId, band.id),
                eq(bandRoles.roleId, application.roleId),
              ),
            );
        }
        const remaining = await tx
          .select()
          .from(bandRoles)
          .where(eq(bandRoles.bandId, band.id))
          .limit(1);
        if (!remaining.length)
          await tx
            .update(bands)
            .set({ isOpen: false })
            .where(eq(bands.id, band.id));
      } else {
        await tx.delete(applications).where(eq(applications.id, id));
      }
      await tx.insert(notifications).values({
        userId: application.userId,
        message: `Permohonan bergabung dengan ${band.name} ${accept ? "diterima" : "ditolak"}.`,
      });
    });
    return { message: accept ? "Permohonan diterima." : "Permohonan ditolak." };
  },
};
