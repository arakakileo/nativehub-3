/**
 * Seed Admin User Script
 * Creates an admin user with email/password credentials
 *
 * Usage: npx tsx scripts/seed-admin.ts
 */
import { randomBytes, scrypt as scryptCallback } from "node:crypto"
import { promisify } from "node:util"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { users, accounts } from "../src/db/auth-schema.js"
import { eq } from "drizzle-orm"

const scrypt = promisify(scryptCallback)

// Config
const ADMIN_EMAIL = "contato@arakakileo.com"
const ADMIN_NAME = "Admin"

// Generate random password (16 chars, alphanumeric)
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let password = ""
  const randomBytesArray = randomBytes(16)
  for (let i = 0; i < 16; i++) {
    password += chars[randomBytesArray[i]! % chars.length]
  }
  return password
}

// Hash password using scrypt (Better Auth compatible)
// Uses same params as Better Auth: N=16384, r=16, p=1, dkLen=64
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  // Normalize password using NFKC (same as Better Auth)
  const normalizedPassword = password.normalize("NFKC")
  // Better Auth scrypt params: N=16384, r=16, p=1, maxmem=128*N*r*2
  const N = 16384
  const r = 16
  const p = 1
  const maxmem = 128 * N * r * 2
  const derivedKey = (await scrypt(normalizedPassword, salt, 64, { N, r, p, maxmem })) as Buffer
  return `${salt}:${derivedKey.toString("hex")}`
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const client = postgres(databaseUrl)
  const db = drizzle(client)

  console.log("Seeding admin user...")

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1)

  if (existingUser.length > 0) {
    console.log(`User ${ADMIN_EMAIL} already exists`)

    // Check if account exists
    const existingAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, existingUser[0]!.id))
      .limit(1)

    if (existingAccount.length > 0) {
      // Generate new password and update
      const password = generatePassword()
      const hashedPassword = await hashPassword(password)

      await db
        .update(accounts)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, existingAccount[0]!.id))

      console.log("\n=== CREDENTIALS UPDATED ===")
      console.log(`Email: ${ADMIN_EMAIL}`)
      console.log(`Password: ${password}`)
      console.log("===========================\n")
    } else {
      // Create account for existing user
      const password = generatePassword()
      const hashedPassword = await hashPassword(password)

      await db.insert(accounts).values({
        userId: existingUser[0]!.id,
        accountId: ADMIN_EMAIL,
        providerId: "credential",
        password: hashedPassword,
      })

      console.log("\n=== CREDENTIALS CREATED ===")
      console.log(`Email: ${ADMIN_EMAIL}`)
      console.log(`Password: ${password}`)
      console.log("===========================\n")
    }
  } else {
    // Create new user and account
    const password = generatePassword()
    const hashedPassword = await hashPassword(password)

    const [newUser] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        emailVerified: true,
      })
      .returning()

    await db.insert(accounts).values({
      userId: newUser!.id,
      accountId: ADMIN_EMAIL,
      providerId: "credential",
      password: hashedPassword,
    })

    console.log("\n=== ADMIN USER CREATED ===")
    console.log(`Email: ${ADMIN_EMAIL}`)
    console.log(`Password: ${password}`)
    console.log("===========================\n")
  }

  await client.end()
  console.log("Done!")
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
