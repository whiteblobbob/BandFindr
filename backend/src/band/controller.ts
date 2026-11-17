import { Elysia, t } from "elysia";
import { authenticate } from "../auth/service";
import {
  id,
  idParams,
  name,
  pagination,
  imageBody,
} from "../shared/validation";
import { bandService } from "./service";
import { uploadBandImage } from "../shared/images";
const fields = {
  name,
  description: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
  genre_ids: t.Array(id, { maxItems: 30, uniqueItems: true }),
  open_roles: t.Array(
    t.Object({
      role_id: id,
      slot_left: t.Integer({ minimum: 1, maximum: 100 }),
    }),
    { maxItems: 30 },
  ),
};
export const bandController = new Elysia()
  .get("/", ({ query }) => bandService.query(query), {
    query: t.Object({
      ...pagination,
      name: t.Optional(name),
      genre: t.Optional(id),
      role: t.Optional(id),
      is_open: t.Optional(t.Boolean()),
    }),
  })
  .get("/:id", ({ params }) => bandService.fetch(params.id), {
    params: idParams,
  })
  .post(
    "/",
    async ({ headers, body, set }) => {
      const { userId } = await authenticate(headers.authorization);
      const band = await bandService.create(userId, body);
      set.status = 201;
      return band;
    },
    { body: t.Object({ ...fields, leader_role_id: id }) },
  )
  .patch(
    "/:id",
    async ({ headers, params, body }) =>
      bandService.update(
        params.id,
        (await authenticate(headers.authorization)).userId,
        body,
      ),
    {
      params: idParams,
      body: t.Partial(t.Object({ ...fields, is_open: t.Boolean() })),
    },
  )
  .post(
    "/:id/logo",
    async ({ headers, params, body }) =>
      uploadBandImage(
        params.id,
        (await authenticate(headers.authorization)).userId,
        body.image,
      ),
    { params: idParams, body: imageBody },
  );
