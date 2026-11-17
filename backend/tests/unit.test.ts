import { describe, test, expect } from "bun:test";
import { ApiError, errorResponse } from "../src/shared/errors";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
process.env.SUPABASE_URL ??= "http://127.0.0.1:55421";
process.env.SUPABASE_ANON_KEY ??= "test";
const { app } = await import("../src/app");
const { validateImage } = await import("../src/shared/images");

describe("HTTP boundaries", () => {
  test("health, missing route, and invalid payload are formatted", async () => {
    expect(
      (await app.handle(new Request("http://localhost/health"))).status,
    ).toBe(200);
    const absent = await app.handle(new Request("http://localhost/absent"));
    expect(absent.status).toBe(404);
    expect((await absent.json()).error.message).toBe("Alamat tidak ditemukan.");
    const invalid = await app.handle(
      new Request("http://localhost/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Periksa kembali data yang dikirim.",
      },
    });
  });
  test("protected routes require a bearer token", async () => {
    for (const path of [
      "/notifications",
      "/applications/band/00000000-0000-4000-8000-000000000001",
    ]) {
      const response = await app.handle(new Request(`http://localhost${path}`));
      expect(response.status).toBe(401);
    }
  });
  test("invalid pagination and UUIDs are rejected", async () => {
    for (const path of [
      "/bands?limit=101",
      "/bands?offset=-1",
      "/bands?is_open=invalid",
      "/bands/not-a-uuid",
    ]) {
      expect(
        (await app.handle(new Request(`http://localhost${path}`))).status,
      ).toBe(422);
    }
  });
  test("database details are hidden", () => {
    const response = errorResponse(
      { cause: { code: "23505", detail: "private table detail" } },
      "UNKNOWN",
    );
    expect(response.status).toBe(409);
    expect(JSON.stringify(response)).not.toContain("private");
    expect(
      errorResponse(
        new ApiError(403, "FORBIDDEN", "Tidak diizinkan."),
        "UNKNOWN",
      ).status,
    ).toBe(403);
  });
});
describe("image validation", () => {
  test("rejects mismatched MIME and image bytes, empty and oversized images", async () => {
    for (const file of [
      new File(["hello"], "fake.png", { type: "image/png" }),
      new File([], "empty.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(6 * 1024 * 1024)], "large.webp", {
        type: "image/webp",
      }),
    ]) {
      await expect(validateImage(file)).rejects.toBeInstanceOf(ApiError);
    }
  });
  test("accepts PNG signatures before Cloudinary decodes the image", async () => {
    expect(
      (
        await validateImage(
          new File(
            [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
            "test.png",
            { type: "image/png" },
          ),
        )
      ).length,
    ).toBe(8);
  });
});
