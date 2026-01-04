import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./lib/db.js"
import { trustedOrigins, isProduction, authConfig } from "./lib/config.js"
import * as schema from "./db/auth-schema.js"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: authConfig.minPasswordLength,
    disableSignUp: true, // Only pre-seeded users can login
  },
  session: {
    expiresIn: 60 * 60 * 24 * authConfig.sessionExpiryDays,
    updateAge: 60 * 60 * 24 * authConfig.sessionUpdateDays,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  advanced: {
    cookiePrefix: authConfig.cookiePrefix,
    useSecureCookies: isProduction,
  },
})

// Export types for use in middleware
export type Session = typeof auth.$Infer.Session
export type User = Session["user"]
