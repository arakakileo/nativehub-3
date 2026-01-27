import { Hono } from "hono"
import { auth } from "../auth.js"

// Better Auth handler - handles all /api/auth/* routes
export const authRoutes = new Hono()
  .on(["POST", "GET"], "/*", (c) => auth.handler(c.req.raw))
