import { Elysia } from "elysia";
import { catalogService } from "./service";
export const catalogController = new Elysia()
  .get("/roles", () => catalogService.roles())
  .get("/genres", () => catalogService.genres());
