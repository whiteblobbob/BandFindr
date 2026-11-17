import { Elysia } from "elysia";
import { authenticate } from "../auth/service";
import { idParams, pageQuery } from "../shared/validation";
import { notificationService } from "./service";
export const notificationController = new Elysia()
  .get(
    "/",
    async ({ headers, query }) =>
      notificationService.fetch(
        (await authenticate(headers.authorization)).userId,
        query.limit,
        query.offset,
      ),
    { query: pageQuery },
  )
  .patch(
    "/:id/read",
    async ({ headers, params }) =>
      notificationService.read(
        params.id,
        (await authenticate(headers.authorization)).userId,
      ),
    { params: idParams },
  );
