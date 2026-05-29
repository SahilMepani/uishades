/**
 * Session helpers built on Astro's Sessions API (Cloudflare adapter auto-wires
 * the `SESSION` KV). We store only `userId`. Types are derived from
 * `APIContext['session']` so we don't depend on the exact exported type name.
 */
import type { APIContext } from 'astro';
import { getUserById } from './db';
import type { User } from './types';

type Session = NonNullable<APIContext['session']>;

const USER_ID_KEY = 'userId';

/**
 * Establish a logged-in session. Regenerates the session id *before* writing
 * `userId` to defeat session fixation (Security §7). Call on every successful
 * auth (OAuth + magic link).
 */
export async function loginUser(session: Session, userId: string): Promise<void> {
  await session.regenerate();
  session.set(USER_ID_KEY, userId);
}

export async function currentUserId(session: Session | undefined): Promise<string | null> {
  if (!session) return null;
  const id = await session.get(USER_ID_KEY);
  return typeof id === 'string' ? id : null;
}

export async function currentUser(
  session: Session | undefined,
  db: D1Database,
): Promise<User | null> {
  const id = await currentUserId(session);
  if (!id) return null;
  return getUserById(db, id);
}
