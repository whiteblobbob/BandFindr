import { Elysia, t } from "elysia";
import { authService, authenticate } from "./service";
const credentials = {
  email: t.String({ format: "email", maxLength: 254 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
};
export const authController = new Elysia()
  .onTransform(({ body }) => {
    if (
      body &&
      typeof body === "object" &&
      "email" in body &&
      typeof body.email === "string"
    )
      body.email = body.email.trim().toLowerCase();
  })
  .post("/send-code", ({ body }) => authService.sendCode(body), {
    body: t.Object(
      { email: credentials.email },
      { additionalProperties: false },
    ),
  })
  .post("/signup", ({ body }) => authService.signup(body), {
    body: t.Object(
      { ...credentials, code: t.String({ pattern: "^[0-9]{6}$" }) },
      { additionalProperties: false },
    ),
  })
  .post("/login", ({ body }) => authService.login(body), {
    body: t.Object(credentials),
  })
  .post("/refresh", ({ body }) => authService.refresh(body), {
    body: t.Object({
      refresh_token: t.String({ minLength: 1, maxLength: 4096 }),
    }),
  })
  .post("/logout", async ({ headers }) =>
    authService.logout(
      (await authenticate(headers.authorization, false)).token,
    ),
  );
