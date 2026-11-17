import { Elysia } from "elysia";
import { userController } from "./controller";
export const userRouter = new Elysia({ prefix: "/users" }).use(userController);
