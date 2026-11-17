import { Elysia, t } from "elysia";
import { authenticate } from "../auth/service";
import { id, idParams, name, imageBody } from "../shared/validation";
import { userService } from "./service";
import { uploadProfileImage } from "../shared/images";
export const userController = new Elysia()
  .get("/:id", ({ params }) => userService.fetch(params.id), {
    params: idParams,
  })
  .patch(
    "/me",
    async ({ headers, body }) =>
      userService.update(
        (await authenticate(headers.authorization)).userId,
        body,
      ),
    {
      body: t.Partial(
        t.Object({
          name,
          bio: t.Nullable(t.String({ maxLength: 2000 })),
          province: name,
          city: name,
          date_of_birth: t.String({ format: "date" }),
          social_medias: t.Array(
            t.String({ format: "uri", pattern: "^https?://", maxLength: 2048 }),
            { maxItems: 10, uniqueItems: true },
          ),
          role_ids: t.Array(id, {
            minItems: 1,
            maxItems: 30,
            uniqueItems: true,
          }),
        }),
      ),
    },
  )
  .post(
    "/me/image",
    async ({ headers, body }) =>
      uploadProfileImage(
        (await authenticate(headers.authorization)).userId,
        body.image,
      ),
    { body: imageBody },
  );
