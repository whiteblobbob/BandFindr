import { Elysia, t } from "elysia";
import { authService, authenticate } from "./service";
import { name } from "../shared/validation";
const credentials = {
  email: t.String({ format: "email", maxLength: 254 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
};
export const authController = new Elysia()
  .post("/signup", ({ body }) => authService.signup(body), {
    body: t.Object({
      ...credentials,
      name,
      province: name,
      city: name,
      date_of_birth: t.String({ format: "date" }),
    }),
  })
  .post("/verify", ({ body }) => authService.verify(body), {
    body: t.Object({
      email: credentials.email,
      token: t.String({ pattern: "^[0-9]{6,10}$" }),
    }),
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
    authService.logout((await authenticate(headers.authorization)).token),
  );
