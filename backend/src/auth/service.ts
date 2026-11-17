import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { registrationCodes, users } from "../db/schema";
import { sendRegistrationCode } from "./email";
import { createClient } from "@supabase/supabase-js";
import { config } from "../shared/config";
import { ApiError } from "../shared/errors";
export const authClient = () =>
  createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
function authError(error: { status?: number; code?: string } | null) {
  if (!error) return;
  if (error.status === 429)
    throw new ApiError(
      429,
      "RATE_LIMIT",
      "Terlalu banyak percobaan. Coba lagi nanti.",
    );
  throw new ApiError(
    400,
    "AUTH_ERROR",
    "Autentikasi gagal. Periksa data dan verifikasi email Anda.",
  );
}
export const authService = {
  async sendCode(body: { email: string }) {
    const email = body.email.trim().toLowerCase();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`,
      );
      const existing = await tx.execute(
        sql`SELECT id FROM auth.users WHERE lower(email) = ${email} LIMIT 1`,
      );
      if (existing.length) return;
      const [previous] = await tx
        .select()
        .from(registrationCodes)
        .where(eq(registrationCodes.email, email));
      if (previous && Date.now() - previous.sentAt.getTime() < 60_000)
        throw new ApiError(
          429,
          "RATE_LIMIT",
          "Tunggu 60 detik sebelum meminta kode baru.",
        );
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const codeHash = await Bun.password.hash(`${email}:${code}`, {
        algorithm: "argon2id",
      });
      await sendRegistrationCode(email, code);
      const sentAt = new Date();
      const values = {
        email,
        codeHash,
        sentAt,
        expiresAt: new Date(sentAt.getTime() + 600_000),
        failedAttempts: 0,
      };
      await tx
        .insert(registrationCodes)
        .values(values)
        .onConflictDoUpdate({ target: registrationCodes.email, set: values });
    });
    return {
      message: "Jika email dapat didaftarkan, kode verifikasi telah dikirim.",
    };
  },
  async signup(body: { email: string; password: string; code: string }) {
    const email = body.email.trim().toLowerCase();
    const failure = new ApiError(
      400,
      "AUTH_ERROR",
      "Pendaftaran gagal. Periksa email dan kode Anda.",
    );
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`,
      );
      // The Auth trigger consumes the code; a row lock here would deadlock its transaction.
      const [record] = await tx
        .select()
        .from(registrationCodes)
        .where(eq(registrationCodes.email, email));
      if (
        !record ||
        record.expiresAt.getTime() <= Date.now() ||
        record.failedAttempts >= 5
      )
        return failure;
      if (
        !(await Bun.password.verify(`${email}:${body.code}`, record.codeHash))
      ) {
        await tx
          .update(registrationCodes)
          .set({ failedAttempts: record.failedAttempts + 1 })
          .where(eq(registrationCodes.email, email));
        return failure;
      }
      if (!config.supabaseServiceRoleKey)
        throw new ApiError(
          503,
          "AUTH_UNAVAILABLE",
          "Pendaftaran sementara tidak tersedia.",
        );
      try {
        const response = await fetch(
          `${config.supabaseUrl}/auth/v1/admin/users`,
          {
            method: "POST",
            headers: {
              apikey: config.supabaseServiceRoleKey,
              Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              password: body.password,
              email_confirm: true,
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok) return failure;
      } catch {
        return failure;
      }
      return null;
    });
    if (outcome) throw outcome;
    return {
      message: "Pendaftaran berhasil. Silakan masuk dan lengkapi profil Anda.",
    };
  },
  async login(body: { email: string; password: string }) {
    const result = await authClient().auth.signInWithPassword({
      ...body,
      email: body.email.trim().toLowerCase(),
    });
    authError(result.error);
    if (!result.data.user?.email_confirmed_at)
      throw new ApiError(
        403,
        "EMAIL_UNVERIFIED",
        "Verifikasi email Anda terlebih dahulu.",
      );
    return result.data.session;
  },
  async refresh(body: { refresh_token: string }) {
    const result = await authClient().auth.refreshSession(body);
    authError(result.error);
    return result.data.session;
  },
  async logout(token: string) {
    const result = await fetch(
      `${config.supabaseUrl}/auth/v1/logout?scope=local`,
      {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!result.ok)
      throw new ApiError(400, "AUTH_ERROR", "Gagal keluar. Silakan coba lagi.");
    return { message: "Berhasil keluar." };
  },
};
export async function authenticate(
  authorization?: string,
  requireProfile = true,
) {
  const match = authorization?.match(/^Bearer (\S+)$/i);
  if (!match?.[1])
    throw new ApiError(401, "UNAUTHORIZED", "Silakan masuk terlebih dahulu.");
  const token = match[1];
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sesi tidak valid atau telah berakhir.",
    );
  if (!data.user.email_confirmed_at)
    throw new ApiError(
      403,
      "EMAIL_UNVERIFIED",
      "Verifikasi email Anda terlebih dahulu.",
    );
  if (requireProfile) {
    const [profile] = await db
      .select({ complete: users.isProfileComplete })
      .from(users)
      .where(eq(users.id, data.user.id));
    if (!profile?.complete)
      throw new ApiError(
        403,
        "PROFILE_INCOMPLETE",
        "Lengkapi profil Anda terlebih dahulu.",
      );
  }
  return { userId: data.user.id, token };
}
