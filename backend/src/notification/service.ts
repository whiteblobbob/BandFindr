import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { notifications } from "../db/schema";
import { missing } from "../shared/errors";
const fields = {
  id: notifications.id,
  message: notifications.message,
  is_read: notifications.isRead,
};
export const notificationService = {
  fetch(userId: string, limit = 20, offset = 0) {
    return db
      .select(fields)
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(notifications.id)
      .limit(limit)
      .offset(offset);
  },
  async read(id: string, userId: string) {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning(fields);
    return notification ?? missing("Notifikasi tidak ditemukan.");
  },
};
