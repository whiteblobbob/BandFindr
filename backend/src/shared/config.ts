function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
export const config = {
  databaseUrl: required("DATABASE_URL"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  port: Number(process.env.PORT ?? 3000),
  cloudinaryFolder:
    process.env.NODE_ENV === "production" ? "bandfindr" : "bandfindr/dev",
};
