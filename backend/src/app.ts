import { Elysia } from "elysia";
import { errorResponse } from "./shared/errors";
import { authRouter } from "./auth/router";
import { userRouter } from "./user/router";
import { bandRouter } from "./band/router";
import { applicationRouter } from "./application/router";
import { notificationRouter } from "./notification/router";
import { catalogRouter } from "./catalog/router";
export const app = new Elysia({
  serve: { maxRequestBodySize: 6 * 1024 * 1024 },
})
  .onError(({ error, code, set }) => {
    const result = errorResponse(error, String(code));
    set.status = result.status;
    return result.body;
  })
  .get("/health", () => ({ message: "Layanan tersedia." }))
  .use(authRouter)
  .use(userRouter)
  .use(bandRouter)
  .use(applicationRouter)
  .use(notificationRouter)
  .use(catalogRouter);
