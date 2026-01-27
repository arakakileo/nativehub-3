/**
 * Mock db module for tests
 * Re-exports testDb from setup as the db instance
 */

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../db/schema.js'

// Create test database
const pgClient = new PGlite()
export const testDb = drizzle(pgClient, { schema })

// Export as db for services
export const db = testDb
export { pgClient }
