import { t } from "elysia";
export const id = t.String({ format: "uuid" });
export const idParams = t.Object({ id });
export const name = t.String({ minLength: 1, maxLength: 100, pattern: "\\S" });
export const pagination = {
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
};
export const pageQuery = t.Object(pagination);
export const imageBody = t.Object({
  image: t.File({
    type: ["image/jpeg", "image/png", "image/webp"],
    maxSize: "5m",
  }),
});
