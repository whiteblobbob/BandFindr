import { Elysia } from "elysia";
import { catalogController } from "./controller";
export const catalogRouter = new Elysia({ prefix: "/catalog" }).use(
  catalogController,
);
