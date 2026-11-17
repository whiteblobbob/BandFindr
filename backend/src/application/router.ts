import { Elysia } from "elysia";
import { applicationController } from "./controller";
export const applicationRouter = new Elysia({ prefix: "/applications" }).use(
  applicationController,
);
