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
  async signup(body: {
    email: string;
    password: string;
    name: string;
    province: string;
    city: string;
    date_of_birth: string;
  }) {
    const { email, password, ...data } = body;
    const result = await authClient().auth.signUp({
      email,
      password,
      options: { data },
    });
    authError(result.error);
    return { message: "Periksa email Anda untuk melakukan verifikasi." };
  },
  async verify(body: { email: string; token: string }) {
    const result = await authClient().auth.verifyOtp({
      ...body,
      type: "signup",
    });
    authError(result.error);
    return { message: "Email berhasil diverifikasi. Silakan masuk." };
  },
  async login(body: { email: string; password: string }) {
    const result = await authClient().auth.signInWithPassword(body);
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
export async function authenticate(authorization?: string) {
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
  return { userId: data.user.id, token };
}
