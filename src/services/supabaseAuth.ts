import { getSupabaseAdmin } from '../config/supabase';
import logger from '../config/logger';

export type EnsureAuthInput = {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: string;
  organizationId?: string | null;
  /** true = skip email verification (existing / migrated accounts) */
  emailConfirm?: boolean;
};

/**
 * Create or update user in Supabase Auth (Authentication → Users).
 * Returns auth user id, or null if Supabase admin unavailable.
 */
export async function ensureSupabaseAuthUser(input: EnsureAuthInput): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const email = input.email.trim().toLowerCase();
  const meta = {
    full_name: input.fullName || '',
    phone: input.phone || '',
    role: input.role || 'org_admin',
    organization_id: input.organizationId || null,
  };

  try {
    const existingId = await findAuthUserIdByEmail(email);
    if (existingId) {
      const { error } = await admin.auth.admin.updateUserById(existingId, {
        password: input.password,
        email_confirm: input.emailConfirm === true ? true : undefined,
        user_metadata: meta,
      });
      if (error) {
        logger.warn(`Supabase Auth update failed (${email}): ${error.message}`);
        return existingId;
      }
      return existingId;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: Boolean(input.emailConfirm),
      user_metadata: meta,
    });

    if (error) {
      logger.warn(`Supabase Auth create failed (${email}): ${error.message}`);
      return null;
    }
    return data.user?.id || null;
  } catch (err) {
    logger.warn(`ensureSupabaseAuthUser: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  // Paginate admin users list (usually small for this product)
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      logger.warn(`listUsers failed: ${error.message}`);
      return null;
    }
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function getSupabaseAuthEmailStatus(email: string): Promise<{
  exists: boolean;
  confirmed: boolean;
  id: string | null;
}> {
  const admin = getSupabaseAdmin();
  if (!admin) return { exists: false, confirmed: true, id: null };

  const id = await findAuthUserIdByEmail(email.trim().toLowerCase());
  if (!id) return { exists: false, confirmed: false, id: null };

  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) return { exists: true, confirmed: false, id };

  const confirmed = Boolean(
    data.user.email_confirmed_at || data.user.confirmed_at || (data.user as { email_confirmed?: boolean }).email_confirmed
  );
  return { exists: true, confirmed, id };
}

/** Send / resend signup verification email via anon signUp (idempotent-ish). */
export async function sendSupabaseVerificationEmail(email: string, password: string): Promise<void> {
  const { getSupabase } = await import('../config/supabase');
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.auth.signUp({ email, password });
  if (error && !/already|registered/i.test(error.message)) {
    logger.warn(`Verification email: ${error.message}`);
  }
}
