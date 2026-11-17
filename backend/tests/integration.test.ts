import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;
suite("local Supabase integration", () => {
  let app: (typeof import("../src/app"))["app"];
  let sql: (typeof import("../src/db"))["connection"];
  let admin: ReturnType<typeof createClient>;
  const createdUsers: string[] = [];
  const password = "BandFindr-testing-123!";
  const suffix = crypto.randomUUID();
  const fixtures: {
    id: string;
    token: string;
    email: string;
    refresh_token: string;
  }[] = [];
  let guitarist: string, drummer: string, rock: string;
  const profile = {
    name: "Pemusik",
    province: "Sulawesi Selatan",
    city: "Makassar",
    date_of_birth: "2000-01-01",
  };
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
  ) {
    const response = await app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    return { status: response.status, body: (await response.json()) as any };
  }
  async function band(slots = 1, otherRole = false) {
    const response = await request(
      "/bands",
      "POST",
      {
        name: `Band ${suffix} ${crypto.randomUUID()}`,
        genre_ids: [rock],
        leader_role_id: guitarist,
        open_roles: [
          { role_id: guitarist, slot_left: slots },
          ...(otherRole ? [{ role_id: drummer, slot_left: 1 }] : []),
        ],
      },
      fixtures[0]!.token,
    );
    expect(response.status).toBe(201);
    return response.body;
  }
  async function apply(bandId: string, fixture = 1, roleId = guitarist) {
    const response = await request(
      "/applications",
      "POST",
      { band_id: bandId, role_id: roleId },
      fixtures[fixture]!.token,
    );
    expect(response.status).toBe(201);
    return response.body.id as string;
  }
  beforeAll(async () => {
    if (
      !["127.0.0.1", "localhost"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      ) ||
      !["127.0.0.1", "localhost"].includes(
        new URL(process.env.SUPABASE_URL!).hostname,
      )
    )
      throw new Error("Integration tests require local Supabase.");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error(
        "Set SUPABASE_SERVICE_ROLE_KEY for integration fixtures.",
      );
    app = (await import("../src/app")).app;
    sql = (await import("../src/db")).connection;
    admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const roles = await request("/catalog/roles");
    expect(roles.status).toBe(200);
    guitarist = roles.body.find((r: any) => r.name === "Guitarist").id;
    drummer = roles.body.find((r: any) => r.name === "Drummer").id;
    rock = (await request("/catalog/genres")).body.find(
      (r: any) => r.name === "Rock",
    ).id;
    for (let i = 0; i < 4; i++) {
      const email = `bandfindr-${suffix}-${i}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: profile,
      });
      if (error || !data.user)
        throw error ?? new Error("Fixture creation failed");
      createdUsers.push(data.user.id);
      const login = await request("/auth/login", "POST", { email, password });
      expect(login.status).toBe(200);
      fixtures.push({
        id: data.user.id,
        token: login.body.access_token,
        refresh_token: login.body.refresh_token,
        email,
      });
      expect(
        (
          await request(
            "/users/me",
            "PATCH",
            { role_ids: [guitarist, drummer] },
            login.body.access_token,
          )
        ).status,
      ).toBe(200);
    }
  }, 60000);
  afterAll(async () => {
    if (admin)
      for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
    if (sql) await sql.end();
  });
  test("signup trigger rejects missing fields atomically even through Supabase directly", async () => {
    const email = `invalid-${suffix}@example.com`;
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: "Incomplete" },
    });
    expect(error).not.toBeNull();
    expect(
      (await sql`select id from auth.users where email = ${email}`).length,
    ).toBe(0);
  });
  test("signup, OTP verification, login, refresh and logout through HTTP", async () => {
    const email = `signup-${suffix}@example.com`;
    expect(
      (await request("/auth/signup", "POST", { email, password, ...profile }))
        .status,
    ).toBe(200);
    const [user] = await sql`select id from auth.users where email = ${email}`;
    createdUsers.push(user!.id);
    expect(
      (await request("/auth/login", "POST", { email, password })).status,
    ).toBe(400);
    const messages = (await fetch(
      "http://127.0.0.1:55424/api/v1/messages",
    ).then((r) => r.json())) as any;
    const message = messages.messages.find((m: any) =>
      m.To.some((recipient: any) => recipient.Address === email),
    );
    expect(message).toBeDefined();
    const content = (await fetch(
      `http://127.0.0.1:55424/api/v1/message/${message.ID}`,
    ).then((r) => r.json())) as any;
    const token = `${content.Text} ${content.HTML}`.match(/\b\d{6}\b/)?.[0];
    expect(token).toBeDefined();
    expect(
      (await request("/auth/verify", "POST", { email, token })).status,
    ).toBe(200);
    const login = await request("/auth/login", "POST", { email, password });
    expect(login.status).toBe(200);
    expect(
      (
        await request("/auth/refresh", "POST", {
          refresh_token: login.body.refresh_token,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/auth/logout",
          "POST",
          undefined,
          login.body.access_token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/auth/verify", "POST", { email, token: "000000" }))
        .status,
    ).toBe(400);
  }, 30000);
  test("profile privacy, role selection and public band filters", async () => {
    const response = await request(`/users/${fixtures[0]!.id}`);
    expect(response.body).not.toHaveProperty("date_of_birth");
    expect(response.body.roles.length).toBe(2);
    const b = await band();
    expect(b.province).toBe(profile.province);
    expect(b.open_roles[0].slot_left).toBe(1);
    const filtered = await request(
      `/bands?name=${encodeURIComponent(suffix)}&genre=${rock}&role=${guitarist}&is_open=true&limit=100`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.some((v: any) => v.id === b.id)).toBe(true);
    expect((await request(`/bands/${b.id}`)).body.open_roles[0].role_id).toBe(
      guitarist,
    );
    expect(
      (await request("/bands?is_open=false")).body.every(
        (v: any) => !v.is_open,
      ),
    ).toBe(true);
    expect(
      (
        await sql`select * from public.band_members where band_id = ${b.id} and user_id = ${fixtures[0]!.id}`
      ).length,
    ).toBe(1);
  });
  test("ownership, role matching, vacancies, duplicate applications and existing members", async () => {
    const b = await band();
    expect(
      (
        await request(
          `/bands/${b.id}`,
          "PATCH",
          { name: "Forbidden" },
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/applications",
          "POST",
          { band_id: b.id, role_id: guitarist },
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/applications",
          "POST",
          { band_id: b.id, role_id: drummer },
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(409);
    await request(
      "/users/me",
      "PATCH",
      { role_ids: [drummer] },
      fixtures[3]!.token,
    );
    expect(
      (
        await request(
          "/applications",
          "POST",
          { band_id: b.id, role_id: guitarist },
          fixtures[3]!.token,
        )
      ).status,
    ).toBe(400);
    const id = await apply(b.id);
    expect(
      (
        await request(
          "/applications",
          "POST",
          { band_id: b.id, role_id: guitarist },
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/applications/${id}`,
          "GET",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/applications/${id}`,
          "GET",
          undefined,
          fixtures[2]!.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/applications/${id}/accept`,
          "POST",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/applications/band/${b.id}`,
          "GET",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/applications/band/${b.id}`,
          "GET",
          undefined,
          fixtures[0]!.token,
        )
      ).body.length,
    ).toBe(1);
  });
  test("acceptance, automatic rejection, notification ownership and read idempotency", async () => {
    const b = await band();
    const a = await apply(b.id, 1);
    const other = await apply(b.id, 2);
    expect(
      (
        await request(
          `/applications/${a}/accept`,
          "POST",
          undefined,
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(200);
    const detail = await request(`/bands/${b.id}`);
    expect(detail.body.is_open).toBe(false);
    expect(detail.body.open_roles).toEqual([]);
    expect(
      (
        await request(
          `/applications/${other}`,
          "GET",
          undefined,
          fixtures[2]!.token,
        )
      ).status,
    ).toBe(404);
    const member =
      await sql`select * from public.band_members where band_id = ${b.id} and user_id = ${fixtures[1]!.id}`;
    expect(member.length).toBe(1);
    const received = await request(
      "/notifications?limit=100",
      "GET",
      undefined,
      fixtures[1]!.token,
    );
    const notification = received.body.find(
      (n: any) => n.message.includes(b.name) && n.message.endsWith("diterima."),
    );
    expect(notification.is_read).toBe(false);
    expect(
      (
        await request(
          `/notifications/${notification.id}/read`,
          "PATCH",
          undefined,
          fixtures[2]!.token,
        )
      ).status,
    ).toBe(404);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(
            `/notifications/${notification.id}/read`,
            "PATCH",
            undefined,
            fixtures[1]!.token,
          )
        ).body.is_read,
      ).toBe(true);
    expect(
      (
        await request(
          `/bands/${b.id}`,
          "PATCH",
          { is_open: true },
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/applications/${a}/accept`,
          "POST",
          undefined,
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(404);
  });
  test("manual rejection deletes the request, notifies and allows reapplication", async () => {
    const b = await band();
    const id = await apply(b.id);
    expect(
      (
        await request(
          `/applications/${id}/reject`,
          "POST",
          undefined,
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await sql`select * from public.notifications where user_id = ${fixtures[1]!.id} and message = ${`Permohonan bergabung dengan ${b.name} ditolak.`}`
      ).length,
    ).toBeGreaterThan(0);
    await apply(b.id);
  });
  test("vacancy removal notifies, positive reduction retains applications, reopening requires slots", async () => {
    const b = await band(2);
    const id = await apply(b.id);
    expect(
      (
        await request(
          `/bands/${b.id}`,
          "PATCH",
          { open_roles: [{ role_id: guitarist, slot_left: 1 }] },
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/applications/${id}`,
          "GET",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/bands/${b.id}`,
          "PATCH",
          { open_roles: [] },
          fixtures[0]!.token,
        )
      ).body.is_open,
    ).toBe(false);
    expect(
      (
        await request(
          `/applications/${id}`,
          "GET",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/bands/${b.id}`,
          "PATCH",
          { open_roles: [{ role_id: guitarist, slot_left: 1 }], is_open: true },
          fixtures[0]!.token,
        )
      ).body.is_open,
    ).toBe(true);
  });
  test("concurrent acceptances for one slot produce one membership", async () => {
    const b = await band();
    const ids = [await apply(b.id, 1), await apply(b.id, 2)];
    const results = await Promise.all(
      ids.map((id) =>
        request(
          `/applications/${id}/accept`,
          "POST",
          undefined,
          fixtures[0]!.token,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 200).length).toBe(1);
    expect(results.filter((r) => r.status === 404).length).toBe(1);
    expect(
      (await sql`select * from public.band_members where band_id = ${b.id}`)
        .length,
    ).toBe(2);
  });
  test("different final roles filled concurrently close the band", async () => {
    const b = await band(1, true);
    const ids = [await apply(b.id, 1), await apply(b.id, 2, drummer)];
    const results = await Promise.all(
      ids.map((id) =>
        request(
          `/applications/${id}/accept`,
          "POST",
          undefined,
          fixtures[0]!.token,
        ),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await request(`/bands/${b.id}`)).body.is_open).toBe(false);
  });
  test("vacancy removal racing with acceptance remains consistent", async () => {
    const b = await band();
    const id = await apply(b.id);
    const [accept, edit] = await Promise.all([
      request(
        `/applications/${id}/accept`,
        "POST",
        undefined,
        fixtures[0]!.token,
      ),
      request(
        `/bands/${b.id}`,
        "PATCH",
        { open_roles: [] },
        fixtures[0]!.token,
      ),
    ]);
    expect([200, 404]).toContain(accept.status);
    expect(edit.status).toBe(200);
    expect((await request(`/bands/${b.id}`)).body.is_open).toBe(false);
    expect(
      (await sql`select * from public.applications where band_id = ${b.id}`)
        .length,
    ).toBe(0);
    expect(
      (await sql`select * from public.band_members where band_id = ${b.id}`)
        .length,
    ).toBe(accept.status === 200 ? 2 : 1);
  });
  test("notification failure rolls the entire acceptance back", async () => {
    const b = await band();
    const id = await apply(b.id);
    const functionName = `test_fail_${suffix.replaceAll("-", "")}`;
    await sql.unsafe(
      `CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${fixtures[1]!.id}' THEN RAISE EXCEPTION 'test notification failure'; END IF; RETURN NEW; END $$`,
    );
    await sql.unsafe(
      `CREATE TRIGGER ${functionName} BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.${functionName}()`,
    );
    try {
      expect(
        (
          await request(
            `/applications/${id}/accept`,
            "POST",
            undefined,
            fixtures[0]!.token,
          )
        ).status,
      ).toBe(500);
      expect(
        (
          await request(
            `/applications/${id}`,
            "GET",
            undefined,
            fixtures[1]!.token,
          )
        ).status,
      ).toBe(200);
      expect(
        (await request(`/bands/${b.id}`)).body.open_roles[0].slot_left,
      ).toBe(1);
      expect(
        (await sql`select * from public.band_members where band_id = ${b.id}`)
          .length,
      ).toBe(1);
    } finally {
      await sql.unsafe(`DROP TRIGGER ${functionName} ON public.notifications`);
      await sql.unsafe(`DROP FUNCTION public.${functionName}()`);
    }
  });
  test("profile edits are private, nullable and atomic on invalid roles", async () => {
    const actor = fixtures[1]!;
    expect(
      (
        await request(
          "/users/me",
          "PATCH",
          { bio: "Musisi", social_medias: ["https://example.com/music"] },
          actor.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/users/me", "PATCH", { bio: null }, actor.token)).body
        .bio,
    ).toBeNull();
    expect(
      (
        await request(
          "/users/me",
          "PATCH",
          { name: "Should roll back", role_ids: [crypto.randomUUID()] },
          actor.token,
        )
      ).status,
    ).toBe(400);
    expect((await request(`/users/${actor.id}`)).body.name).toBe(profile.name);
    expect(
      (
        await request(
          "/users/me",
          "PATCH",
          { date_of_birth: "2999-01-01" },
          actor.token,
        )
      ).status,
    ).toBe(400);
    expect((await request("/users/me", "PATCH", {}, actor.token)).status).toBe(
      200,
    );
    expect((await request(`/users/${crypto.randomUUID()}`)).status).toBe(404);
  });
  test("failed band creation and vacancy edits leave no partial records or notifications", async () => {
    const name = `Invalid ${crypto.randomUUID()}`;
    expect(
      (
        await request(
          "/bands",
          "POST",
          {
            name,
            genre_ids: [crypto.randomUUID()],
            leader_role_id: guitarist,
            open_roles: [],
          },
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (await sql`select * from public.bands where name = ${name}`).length,
    ).toBe(0);
    const b = await band();
    const id = await apply(b.id);
    const edit = await request(
      `/bands/${b.id}`,
      "PATCH",
      { open_roles: [], genre_ids: [crypto.randomUUID()] },
      fixtures[0]!.token,
    );
    expect(edit.status).toBe(400);
    expect(
      (
        await request(
          `/applications/${id}`,
          "GET",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(200);
    expect((await request(`/bands/${b.id}`)).body.open_roles.length).toBe(1);
    expect(
      (
        await sql`select * from public.notifications where message like ${"%" + b.name + "%"}`
      ).length,
    ).toBe(0);
  });
  test("closed recruitment and a removed profile role block acceptance", async () => {
    const b = await band();
    const id = await apply(b.id, 2);
    await request(
      `/bands/${b.id}`,
      "PATCH",
      { is_open: false },
      fixtures[0]!.token,
    );
    expect(
      (
        await request(
          "/applications",
          "POST",
          { band_id: b.id, role_id: guitarist },
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/applications/${id}/accept`,
          "POST",
          undefined,
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(409);
    await request(
      `/bands/${b.id}`,
      "PATCH",
      { is_open: true },
      fixtures[0]!.token,
    );
    await request(
      "/users/me",
      "PATCH",
      { role_ids: [drummer] },
      fixtures[2]!.token,
    );
    expect(
      (
        await request(
          `/applications/${id}/accept`,
          "POST",
          undefined,
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/applications/${id}/reject`,
          "POST",
          undefined,
          fixtures[0]!.token,
        )
      ).status,
    ).toBe(200);
    await request(
      "/users/me",
      "PATCH",
      { role_ids: [guitarist, drummer] },
      fixtures[2]!.token,
    );
  });
  test("automatic rejection is limited to the same band and role", async () => {
    const b = await band(1, true);
    const separate = await band();
    const accepted = await apply(b.id, 1);
    const retainedRole = await apply(b.id, 2, drummer);
    const retainedBand = await apply(separate.id, 2);
    await request(
      `/applications/${accepted}/accept`,
      "POST",
      undefined,
      fixtures[0]!.token,
    );
    for (const id of [retainedRole, retainedBand])
      expect(
        (
          await request(
            `/applications/${id}`,
            "GET",
            undefined,
            fixtures[2]!.token,
          )
        ).status,
      ).toBe(200);
    expect((await request(`/bands/${b.id}`)).body.is_open).toBe(true);
  });
  test("notification lists only expose the recipient's records", async () => {
    const response = await request(
      "/notifications?limit=100",
      "GET",
      undefined,
      fixtures[1]!.token,
    );
    for (const item of response.body) {
      const [row] =
        await sql`select user_id from public.notifications where id = ${item.id}`;
      expect(row!.user_id).toBe(fixtures[1]!.id);
    }
    expect(
      (
        await request(
          `/notifications/${crypto.randomUUID()}/read`,
          "PATCH",
          undefined,
          fixtures[1]!.token,
        )
      ).status,
    ).toBe(404);
  });
  test("upload endpoints reject forged images and non-leaders before contacting Cloudinary", async () => {
    const b = await band();
    async function upload(path: string, token: string, bytes: Uint8Array) {
      const form = new FormData();
      form.set(
        "image",
        new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }),
      );
      return app.handle(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        }),
      );
    }
    const valid = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS2kAAAAASUVORK5CYII=",
      "base64",
    );
    expect(
      (await upload(`/bands/${b.id}/logo`, fixtures[1]!.token, valid)).status,
    ).toBe(403);
    expect(
      (
        await upload(
          "/users/me/image",
          fixtures[1]!.token,
          new Uint8Array([1, 2, 3]),
        )
      ).status,
    ).toBe(422);
    if (!process.env.CLOUDINARY_API_SECRET)
      expect(
        (await upload("/users/me/image", fixtures[1]!.token, valid)).status,
      ).toBe(503);
  });
  test("RLS and grants prevent direct anonymous and authenticated data access", async () => {
    for (const token of [process.env.SUPABASE_ANON_KEY!, fixtures[1]!.token]) {
      const response = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/users?select=*`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
            authorization: `Bearer ${token}`,
          },
        },
      );
      expect([401, 403]).toContain(response.status);
    }
  });
});
