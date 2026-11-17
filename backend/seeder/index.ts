import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NODE_ENV } =
  process.env;
if (
  NODE_ENV === "production" ||
  ![DATABASE_URL, SUPABASE_URL].every(
    (url) => url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  ) ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error("Use local Supabase and set SUPABASE_SERVICE_ROLE_KEY in .env.development.");
}

const auth = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth;
const { db, connection } = await import("../src/db");
const password = "BandFindr-Demo-123!";
const marker = "bandfindr-demo";

async function demoUser(handle: string, name: string) {
  const email = `${handle}@bandfindr.example`;
  const [existing] = await connection<{ id: string; seed: string | null }[]>`
    select id, raw_app_meta_data->>'seed' as seed from auth.users where email = ${email}
  `;
  if (existing) {
    if (existing.seed !== marker) throw new Error(`Demo email already in use: ${email}`);
    return existing.id;
  }
  const { data, error } = await auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { seed: marker },
    user_metadata: {
      name,
      province: "Sulawesi Selatan",
      city: "Makassar",
      date_of_birth: "2000-01-01",
    },
  });
  if (error || !data.user) throw new Error(`Could not create demo user: ${email}`, { cause: error });
  return data.user.id;
}

try {
  const [guitar] = await db.select().from(schema.roles).where(eq(schema.roles.name, "Guitarist"));
  const [drums] = await db.select().from(schema.roles).where(eq(schema.roles.name, "Drummer"));
  const [rock] = await db.select().from(schema.genres).where(eq(schema.genres.name, "Rock"));
  if (!guitar || !drums || !rock) throw new Error("Apply the starter catalog seed first.");

  const leaderId = await demoUser("leader", "Raka Pratama");
  const applicantId = await demoUser("applicant", "Nadia Putri");
  const memberId = await demoUser("member", "Dimas Saputra");

  await db.transaction(async (tx) => {
    await tx.insert(schema.roleUsers).values([
      { userId: leaderId, roleId: guitar.id },
      { userId: applicantId, roleId: drums.id },
      { userId: memberId, roleId: drums.id },
    ]).onConflictDoNothing();

    const openBandId = "43eca55b-4e10-4494-9f3a-ee6c70a2c001";
    const closedBandId = "43eca55b-4e10-4494-9f3a-ee6c70a2c002";
    const inserted = await tx.insert(schema.bands).values([
      { id: openBandId, leaderId, name: "Suara Pelabuhan", description: "Band rock Makassar mencari drummer." },
      { id: closedBandId, leaderId, name: "Ruang Sore", description: "Band rock dengan formasi lengkap.", isOpen: false },
    ]).onConflictDoNothing().returning({ id: schema.bands.id });

    for (const { id: bandId } of inserted) {
      await tx.insert(schema.bandGenres).values({ bandId, genreId: rock.id });
      await tx.insert(schema.bandMembers).values({ bandId, userId: leaderId, roleId: guitar.id });
      if (bandId === openBandId) {
        await tx.insert(schema.bandRoles).values({ bandId, roleId: drums.id, slotLeft: 1 });
        await tx.insert(schema.applications).values({ bandId, userId: applicantId, roleId: drums.id });
      } else {
        await tx.insert(schema.bandMembers).values({ bandId, userId: memberId, roleId: drums.id });
        await tx.insert(schema.notifications).values({ userId: memberId, message: "Permohonan bergabung dengan Ruang Sore diterima." });
      }
    }
    console.log(`Demo bands added: ${inserted.length}`);
  });
} finally {
  await connection.end();
}
