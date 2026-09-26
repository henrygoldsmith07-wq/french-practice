// Postgres access for accounts and sync.
//
// The database is optional: with no DATABASE_URL the app runs exactly as it
// always has — local-first on IndexedDB, no accounts, nothing server-side.
// Every helper throws DatabaseNotConfigured, which the routes turn into a
// clear 503 rather than a stack trace.

import { neon } from '@neondatabase/serverless';

export class DatabaseNotConfigured extends Error {
  constructor() {
    super(
      'Accounts are not configured for this deployment. Set DATABASE_URL to a ' +
        'pooled Postgres connection string to enable sign-in and sync.',
    );
    this.name = 'DatabaseNotConfigured';
  }
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

let client = null;

function sql() {
  const url = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
  if (!url) throw new DatabaseNotConfigured();
  // Connect lazily so importing this module never opens a connection.
  if (!client) client = neon(url);
  return client;
}

export async function queryRows(text, params = []) {
  return sql().query(text, params);
}

/**
 * Resolves the app user behind a verified Google profile, creating or linking
 * one as needed.
 *
 * Matching is by google_sub first — it survives the user changing the address
 * on their Google account — then by email. Email is only trusted as a link key
 * because the caller has already verified Google marked it verified.
 *
 * One statement, so two concurrent first sign-ins cannot both insert.
 */
export async function upsertGoogleUser(profile) {
  const email = String(profile.email).trim().toLowerCase();
  const rows = await queryRows(
    `WITH linked AS (
       UPDATE users SET name = COALESCE($3, name), image = COALESCE($4, image)
        WHERE google_sub = $2
        RETURNING *
     ), inserted AS (
       INSERT INTO users (email, google_sub, name, image)
       SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (SELECT 1 FROM linked)
       ON CONFLICT (email) DO UPDATE
          SET google_sub = EXCLUDED.google_sub,
              name = COALESCE(users.name, EXCLUDED.name),
              image = COALESCE(users.image, EXCLUDED.image)
       RETURNING *
     )
     SELECT * FROM linked
     UNION ALL
     SELECT * FROM inserted`,
    [email, profile.sub, profile.name ?? null, profile.image ?? null],
  );
  if (!rows[0]) throw new Error('Could not resolve a Google account');
  return rows[0];
}

export async function findUserById(id) {
  const rows = await queryRows('select * from users where id = $1', [id]);
  return rows[0] ?? null;
}

export async function readState(userId) {
  const rows = await queryRows(
    'select payload, updated_at, version from user_state where user_id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Replaces this account's snapshot with an atomic compare-and-swap.
 *
 * The client still owns the human conflict decision, but the database enforces
 * the precondition. Returning null means the expected timestamp no longer
 * describes the server state (including the remote row being deleted).
 */
export async function writeState(
  userId,
  payload,
  version,
  { expectedUpdatedAt = null, force = false } = {},
) {
  const rows = await queryRows(
    `with current_state as (
       select updated_at
         from user_state
        where user_id = $1
     ),
     written as (
       insert into user_state (user_id, payload, version, updated_at)
       select $1, $2, $3, now()
        where $5::boolean = true
           or (
             $4::timestamptz is null
             and not exists (select 1 from current_state)
           )
           or (
             $4::timestamptz is not null
             and exists (
               select 1 from current_state
                where updated_at = $4::timestamptz
             )
           )
       on conflict (user_id) do update
         set payload = excluded.payload,
             version = excluded.version,
             updated_at = now()
       where $5::boolean = true
          or (
            $4::timestamptz is not null
            and user_state.updated_at = $4::timestamptz
          )
       returning updated_at
     )
     select updated_at from written`,
    [userId, JSON.stringify(payload), version, expectedUpdatedAt, Boolean(force)],
  );
  return rows[0] ?? null;
}

export async function deleteState(userId) {
  await queryRows('delete from user_state where user_id = $1', [userId]);
}
