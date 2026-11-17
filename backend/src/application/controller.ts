import { Elysia, t } from "elysia";
import { authenticate } from "../auth/service";
import { id, idParams, pageQuery } from "../shared/validation";
import { applicationService } from "./service";
export const applicationController = new Elysia()
  .post(
    "/",
    async ({ headers, body, set }) => {
      const result = await applicationService.create(
        body.band_id,
        (await authenticate(headers.authorization)).userId,
        body.role_id,
      );
      set.status = 201;
      return result;
    },
    { body: t.Object({ band_id: id, role_id: id }) },
  )
  .get(
    "/band/:id",
    async ({ headers, params, query }) =>
      applicationService.list(
        params.id,
        (await authenticate(headers.authorization)).userId,
        query.limit,
        query.offset,
      ),
    { params: idParams, query: pageQuery },
  )
  .get(
    "/:id",
    async ({ headers, params }) =>
      applicationService.fetch(
        params.id,
        (await authenticate(headers.authorization)).userId,
      ),
    { params: idParams },
  )
  .post(
    "/:id/accept",
    async ({ headers, params }) =>
      applicationService.decide(
        params.id,
        (await authenticate(headers.authorization)).userId,
        true,
      ),
    { params: idParams },
  )
  .post(
    "/:id/reject",
    async ({ headers, params }) =>
      applicationService.decide(
        params.id,
        (await authenticate(headers.authorization)).userId,
        false,
      ),
    { params: idParams },
  );
