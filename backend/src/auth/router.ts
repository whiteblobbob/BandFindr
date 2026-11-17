import { Elysia } from "elysia";
import { authController } from "./controller";
export const authRouter = new Elysia({ prefix: "/auth" }).use(authController);
