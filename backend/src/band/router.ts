import { Elysia } from "elysia";
import { bandController } from "./controller";
export const bandRouter = new Elysia({ prefix: "/bands" }).use(bandController);
