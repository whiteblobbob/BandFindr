import { Elysia } from "elysia";
import { notificationController } from "./controller";
export const notificationRouter = new Elysia({ prefix: "/notifications" }).use(
  notificationController,
);
