import { beforeAll, afterAll, describe, expect, test, spyOn } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;
suite("local Supabase integration", () => {
  let app: (typeof import("../src/app"))["app"];
  let sql: (typeof import("../src/db"))["connection"];
  let admin: ReturnType<typeof createClient>;
  const createdUsers: string[] = [];
  const deliveries = new Map<string, string>();
  let deliveryFailure = false;
  let authFailure = false;
  let fetchSpy: ReturnType<typeof spyOn>;
  let originalFetch: typeof fetch;
  let config: (typeof import("../src/shared/config"))["config"];
  async function sendCode(email: string) {
    const response = await request("/auth/send-code", "POST", { email });
    expect(response.status).toBe(200);
    const code = deliveries.get(email.trim().toLowerCase());
    expect(code).toMatch(/^[0-9]{6}$/);
    return code!;
  }
  async function register(email: string) {
    const code = await sendCode(email);
    const response = await request("/auth/signup", "POST", {
      email,
      password,
      code,
    });
    expect(response.status).toBe(200);
    const [user] =
      await sql`select id from auth.users where email = ${email.trim().toLowerCase()}`;
    createdUsers.push(user!.id);
    return { id: user!.id as string, code };
  }
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
    config = (await import("../src/shared/config")).config;
    config.resendApiKey = "test-resend-key";
    config.resendFromEmail = "BandFindr <test@bandfindr.example>";
    originalFetch = globalThis.fetch;
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url === "https://api.resend.com/emails") {
            const payload = JSON.parse(String(init?.body));
            expect(init?.method).toBe("POST");
            expect(new Headers(init?.headers).get("Authorization")).toBe(
              "Bearer test-resend-key",
            );
            expect(payload.from).toBe(config.resendFromEmail);
            expect(payload.subject).toBe("Kode pendaftaran BandFindr");
            if (deliveryFailure)
              return new Response("private provider details", { status: 500 });
            const code = payload.text.match(/\b[0-9]{6}\b/)?.[0];
            expect(code).toBeDefined();
            deliveries.set(payload.to[0], code);
            return Response.json({ id: crypto.randomUUID() });
          }
          if (authFailure && url.endsWith("/auth/v1/admin/users"))
            return new Response("private auth details", { status: 500 });
          return originalFetch(input, init);
        },
        { preconnect: originalFetch.preconnect },
      ),
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
            "/users/me/complete-profile",
            "POST",
            profile,
            login.body.access_token,
          )
        ).status,
      ).toBe(200);
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
    if (sql) {
      await sql`delete from public.registration_codes where email like ${`%${suffix}%`}`;
      await sql.end();
    }
    fetchSpy?.mockRestore();
  });
  test("direct public signup is disabled and admin creation ignores profile metadata", async () => {
    const email = `direct-${suffix}@example.com`;
    const direct = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );
    expect(
      (await direct.auth.signUp({ email, password })).error,
    ).not.toBeNull();
    expect(
      (await sql`select id from auth.users where email = ${email}`).length,
    ).toBe(0);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Ignored", is_profile_complete: true },
    });
    expect(error).toBeNull();
    createdUsers.push(data.user!.id);
    const [row] =
      await sql`select * from public.users where id = ${data.user!.id}`;
    expect(row!.is_profile_complete).toBe(false);
    for (const field of [
      "name",
      "province",
      "city",
      "date_of_birth",
      "bio",
      "profile_public_id",
      "social_medias",
    ])
      expect(row![field]).toBeNull();
    expect(
      (
        await sql`select id from auth.users where id = ${data.user!.id} and email_confirmed_at is not null`
      ).length,
    ).toBe(1);
  });
  test("send code, register, login, complete profile, refresh and logout through HTTP", async () => {
    const email = `signup-${suffix}@example.com`;
    const { id, code } = await register(`  ${email.toUpperCase()}  `);
    expect(
      (
        await sql`select email from public.registration_codes where email = ${email}`
      ).length,
    ).toBe(0);
    expect(
      (await request("/auth/signup", "POST", { email, password, code })).status,
    ).toBe(400);
    expect(
      (await request("/auth/verify", "POST", { email, token: code })).status,
    ).toBe(404);
    const login = await request("/auth/login", "POST", { email, password });
    expect(login.status).toBe(200);
    const token = login.body.access_token;
    expect((await request(`/users/${id}`)).body.is_profile_complete).toBe(
      false,
    );
    for (const path of [
      "/health",
      "/bands",
      "/catalog/roles",
      "/catalog/genres",
      `/users/${id}`,
    ])
      expect((await request(path, "GET", undefined, token)).status).toBe(200);
    const blocked = await request("/notifications", "GET", undefined, token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PROFILE_INCOMPLETE");
    expect(
      (await request("/users/me", "PATCH", { name: "Bypass" }, token)).status,
    ).toBe(403);
    expect(
      (await request("/users/me/complete-profile", "POST", profile)).status,
    ).toBe(401);
    expect(
      (await request("/users/me/complete-profile", "POST", profile, "invalid"))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          "/users/me/complete-profile",
          "POST",
          { name: "Incomplete" },
          token,
        )
      ).status,
    ).toBe(422);
    for (const date_of_birth of ["2999-01-01", "1899-12-31", "2023-02-29"])
      expect(
        (
          await request(
            "/users/me/complete-profile",
            "POST",
            { ...profile, date_of_birth },
            token,
          )
        ).status,
      ).toBeGreaterThanOrEqual(400);
    expect((await request(`/users/${id}`)).body.is_profile_complete).toBe(
      false,
    );
    const results = await Promise.all([
      request("/users/me/complete-profile", "POST", profile, token),
      request("/users/me/complete-profile", "POST", profile, token),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const complete = (await request(`/users/${id}`)).body;
    expect(complete.is_profile_complete).toBe(true);
    expect(complete.name).toBe(profile.name);
    expect(complete).not.toHaveProperty("date_of_birth");
    expect(
      (await request("/notifications", "GET", undefined, token)).status,
    ).toBe(200);
    expect(
      (await request("/users/me/complete-profile", "POST", profile, token))
        .status,
    ).toBe(409);
    expect(
      (
        await request("/auth/refresh", "POST", {
          refresh_token: login.body.refresh_token,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request("/auth/logout", "POST", undefined, token)).status,
    ).toBe(200);
    deliveries.delete(email);
    expect((await request("/auth/send-code", "POST", { email })).status).toBe(
      200,
    );
    expect(deliveries.has(email)).toBe(false);
  }, 30000);
  test("incomplete users can refresh and log out", async () => {
    const email = `logout-${suffix}@example.com`;
    await register(email);
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
  });
  test("every protected action gates incomplete profiles before business authorization", async () => {
    const email = `gates-${suffix}@example.com`;
    const { id } = await register(email);
    const login = await request("/auth/login", "POST", { email, password });
    const token = login.body.access_token;
    const targetId = crypto.randomUUID();
    const actions: [string, string, unknown?][] = [
      ["/users/me", "PATCH", {}],
      [
        "/bands",
        "POST",
        {
          name: "Blocked",
          genre_ids: [],
          leader_role_id: guitarist,
          open_roles: [],
        },
      ],
      [`/bands/${targetId}`, "PATCH", {}],
      ["/applications", "POST", { band_id: targetId, role_id: guitarist }],
      [`/applications/${targetId}`, "GET"],
      [`/applications/band/${targetId}`, "GET"],
      [`/applications/${targetId}/accept`, "POST"],
      [`/applications/${targetId}/reject`, "POST"],
      ["/notifications", "GET"],
      [`/notifications/${targetId}/read`, "PATCH"],
    ];
    for (const [path, method, body] of actions) {
      const denied = await request(path, method, body, token);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("PROFILE_INCOMPLETE");
      expect((await request(path, method, body, "invalid")).status).toBe(401);
    }
    for (const path of ["/users/me/image", `/bands/${targetId}/logo`]) {
      const body = new FormData();
      body.set(
        "image",
        new File(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS2kAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          "image.png",
          { type: "image/png" },
        ),
      );
      const response = await app.handle(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body,
        }),
      );
      expect(response.status).toBe(403);
      expect(((await response.json()) as any).error.code).toBe(
        "PROFILE_INCOMPLETE",
      );
    }
    await expect(
      sql`update public.users set is_profile_complete = true where id = ${id}`,
    ).rejects.toMatchObject({ code: "23514" });
  });
  test("missing email configuration fails safely without creating a code", async () => {
    const email = `missing-config-${suffix}@example.com`;
    const key = config.resendApiKey;
    config.resendApiKey = undefined;
    try {
      expect((await request("/auth/send-code", "POST", { email })).status).toBe(
        503,
      );
      expect(
        (
          await sql`select email from public.registration_codes where email = ${email}`
        ).length,
      ).toBe(0);
    } finally {
      config.resendApiKey = key;
    }
  });
  test("codes are hashed, email-bound, limited, expired, and replaced on resend", async () => {
    const email = `codes-${suffix}@example.com`;
    const code = await sendCode(email);
    const [stored] =
      await sql`select * from public.registration_codes where email = ${email}`;
    expect(stored!.code_hash).toStartWith("$argon2id$");
    expect(
      await Bun.password.verify(`${email}:${code}`, stored!.code_hash),
    ).toBe(true);
    expect(
      new Date(stored!.expires_at).getTime() -
        new Date(stored!.sent_at).getTime(),
    ).toBe(600_000);
    expect((await request("/auth/send-code", "POST", { email })).status).toBe(
      429,
    );
    expect(
      (
        await request("/auth/signup", "POST", {
          email: `other-${suffix}@example.com`,
          password,
          code,
        })
      ).status,
    ).toBe(400);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request("/auth/signup", "POST", {
            email,
            password,
            code: wrong,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await sql`select failed_attempts from public.registration_codes where email = ${email}`
      )[0]!.failed_attempts,
    ).toBe(5);
    expect(
      (await request("/auth/signup", "POST", { email, password, code })).status,
    ).toBe(400);
    await sql`update public.registration_codes set sent_at = now() - interval '61 seconds' where email = ${email}`;
    const newCode = await sendCode(email);
    const [replacement] =
      await sql`select * from public.registration_codes where email = ${email}`;
    expect(replacement!.code_hash).not.toBe(stored!.code_hash);
    expect(replacement!.failed_attempts).toBe(0);
    if (newCode !== code)
      expect(
        (await request("/auth/signup", "POST", { email, password, code }))
          .status,
      ).toBe(400);
    await sql`update public.registration_codes set expires_at = now() - interval '1 second' where email = ${email}`;
    expect(
      (
        await request("/auth/signup", "POST", {
          email,
          password,
          code: newCode,
        })
      ).status,
    ).toBe(400);
    expect(
      (await sql`select id from auth.users where email = ${email}`).length,
    ).toBe(0);
  }, 30000);
  test("delivery and Auth failures preserve the code and hide provider details", async () => {
    const email = `failure-${suffix}@example.com`;
    const code = await sendCode(email);
    await sql`update public.registration_codes set sent_at = now() - interval '61 seconds' where email = ${email}`;
    deliveryFailure = true;
    try {
      const failed = await request("/auth/send-code", "POST", { email });
      expect(failed.status).toBe(503);
      expect(JSON.stringify(failed.body)).not.toContain("private");
    } finally {
      deliveryFailure = false;
    }
    const [retained] =
      await sql`select code_hash from public.registration_codes where email = ${email}`;
    expect(
      await Bun.password.verify(`${email}:${code}`, retained!.code_hash),
    ).toBe(true);
    authFailure = true;
    try {
      const failed = await request("/auth/signup", "POST", {
        email,
        password,
        code,
      });
      expect(failed.status).toBe(400);
      expect(JSON.stringify(failed.body)).not.toContain("private");
    } finally {
      authFailure = false;
    }
    expect(
      (await sql`select id from auth.users where email = ${email}`).length,
    ).toBe(0);
    expect(
      (
        await sql`select email from public.registration_codes where email = ${email}`
      ).length,
    ).toBe(1);
    expect(
      (await request("/auth/signup", "POST", { email, password, code })).status,
    ).toBe(200);
    createdUsers.push(
      (await sql`select id from auth.users where email = ${email}`)[0]!.id,
    );
  });
  test("concurrent sends and signups permit only one successful operation", async () => {
    const email = `concurrent-${suffix}@example.com`;
    const sends = await Promise.all([
      request("/auth/send-code", "POST", { email }),
      request("/auth/send-code", "POST", { email }),
    ]);
    expect(sends.map((r) => r.status).sort()).toEqual([200, 429]);
    const code = deliveries.get(email);
    const signups = await Promise.all([
      request("/auth/signup", "POST", { email, password, code }),
      request("/auth/signup", "POST", { email, password, code }),
    ]);
    expect(signups.map((r) => r.status).sort()).toEqual([200, 400]);
    const rows = await sql`select id from auth.users where email = ${email}`;
    expect(rows.length).toBe(1);
    createdUsers.push(rows[0]!.id);
    expect(
      (
        await sql`select email from public.registration_codes where email = ${email}`
      ).length,
    ).toBe(0);
  });
  test("trigger failures roll back Auth, profile creation, and code consumption together", async () => {
    const email = `rollback-${suffix}@example.com`;
    const code = await sendCode(email);
    await sql.unsafe(
      `CREATE FUNCTION public.test_registration_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.email = '${email}' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN OLD; END $$`,
    );
    await sql.unsafe(
      "CREATE TRIGGER test_registration_rollback BEFORE DELETE ON public.registration_codes FOR EACH ROW EXECUTE FUNCTION public.test_registration_rollback()",
    );
    try {
      expect(
        (await request("/auth/signup", "POST", { email, password, code }))
          .status,
      ).toBe(400);
      expect(
        (await sql`select id from auth.users where email = ${email}`).length,
      ).toBe(0);
      expect(
        (
          await sql`select email from public.registration_codes where email = ${email}`
        ).length,
      ).toBe(1);
    } finally {
      await sql.unsafe(
        "DROP TRIGGER test_registration_rollback ON public.registration_codes",
      );
      await sql.unsafe("DROP FUNCTION public.test_registration_rollback()");
    }
    expect(
      (await request("/auth/signup", "POST", { email, password, code })).status,
    ).toBe(200);
    createdUsers.push(
      (await sql`select id from auth.users where email = ${email}`)[0]!.id,
    );
  });
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
      for (const table of ["users", "registration_codes"]) {
        const response = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`,
          {
            headers: {
              apikey: process.env.SUPABASE_ANON_KEY!,
              authorization: `Bearer ${token}`,
            },
          },
        );
        expect([401, 403]).toContain(response.status);
      }
    }
  });
});
