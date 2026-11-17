function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
export const config = {
  databaseUrl: required("DATABASE_URL"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  port: Number(process.env.PORT ?? 3000),
  cloudinaryFolder:
    process.env.NODE_ENV === "production" ? "bandfindr" : "bandfindr/dev",
};
