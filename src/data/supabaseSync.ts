import { getSupabaseAdmin } from '../config/supabase';
import logger from '../config/logger';

function admin() {
  return getSupabaseAdmin();
}

export async function syncAppStoreToTables(raw: unknown) {
  const sb = admin();
  if (!sb || !raw || typeof raw !== 'object') return;
  const data = raw as Record<string, unknown>;
  const orgs = Array.isArray(data.organizations) ? data.organizations : [];
  const users = Array.isArray(data.users) ? data.users : [];
  const roles = Array.isArray(data.staffRoles) ? data.staffRoles : [];
  const qrs = Array.isArray(data.qrCodes) ? data.qrCodes : [];
  const visitors = Array.isArray(data.visitors) ? data.visitors : [];

  try {
    if (orgs.length) {
      const rows = orgs.map((o: any) => ({
        id: o.id,
        name: o.name || '',
        slug: o.slug || null,
        business_type: o.businessType || '',
        contact_number: o.contactNumber || '',
        email: o.email || '',
        website: o.website ?? null,
        address_line_1: o.addressLine1 || '',
        address_line_2: o.addressLine2 ?? null,
        city: o.city || '',
        state: o.state || '',
        country: o.country || 'India',
        pincode: o.pincode || '',
        admin_user_id: o.adminUserId || null,
        is_active: o.isActive !== false,
        logo_file: o.logoFile ?? null,
        welcome_image_file: o.welcomeImageFile ?? null,
        working_days: o.workingDays ?? null,
        opening_time: o.openingTime ?? null,
        closing_time: o.closingTime ?? null,
        default_wait_minutes: o.defaultWaitMinutes ?? null,
        google_review_enabled: o.googleReviewEnabled ?? null,
        google_review_url: o.googleReviewUrl ?? null,
        created_at: o.createdAt || new Date().toISOString(),
        updated_at: o.updatedAt || new Date().toISOString(),
        raw: o,
      }));
      const { error } = await sb.from('vh_organizations').upsert(rows, { onConflict: 'id' });
      if (error) logger.warn(`vh_organizations sync: ${error.message}`);
    }

    if (users.length) {
      const rows = users.map((u: any) => ({
        id: u.id,
        email: String(u.email || '').toLowerCase(),
        password_hash: u.passwordHash || '',
        full_name: u.fullName || '',
        phone: u.phone || '',
        role: u.role || 'org_admin',
        organization_id: u.organizationId || null,
        staff_role_id: u.staffRoleId || null,
        staff_code: u.staffCode || null,
        allowed_pages: u.allowedPages ?? null,
        is_active: u.isActive !== false,
        supabase_id: u.supabaseId || null,
        created_at: u.createdAt || new Date().toISOString(),
        updated_at: u.updatedAt || new Date().toISOString(),
        raw: u,
      }));
      const { error } = await sb.from('vh_users').upsert(rows, { onConflict: 'id' });
      if (error) logger.warn(`vh_users sync: ${error.message}`);
    }

    if (roles.length) {
      const rows = roles.map((r: any) => ({
        id: r.id,
        organization_id: r.organizationId,
        name: r.name || '',
        code: r.code || null,
        raw: r,
        created_at: r.createdAt || new Date().toISOString(),
        updated_at: r.updatedAt || new Date().toISOString(),
      }));
      const { error } = await sb.from('vh_staff_roles').upsert(rows, { onConflict: 'id' });
      if (error) logger.warn(`vh_staff_roles sync: ${error.message}`);
    }

    if (qrs.length) {
      const rows = qrs.map((q: any) => ({
        id: q.id,
        organization_id: q.organizationId,
        public_code: q.publicCode || null,
        raw: q,
        created_at: q.createdAt || new Date().toISOString(),
        updated_at: q.updatedAt || new Date().toISOString(),
      }));
      const { error } = await sb.from('vh_qr_codes').upsert(rows, { onConflict: 'id' });
      if (error) logger.warn(`vh_qr_codes sync: ${error.message}`);
    }

    if (visitors.length) {
      const rows = visitors.map((v: any) => ({
        id: v.id,
        organization_id: v.organizationId,
        raw: v,
        created_at: v.createdAt || new Date().toISOString(),
        updated_at: v.updatedAt || new Date().toISOString(),
      }));
      // chunk to avoid payload limits
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200);
        const { error } = await sb.from('vh_visitors').upsert(slice, { onConflict: 'id' });
        if (error) logger.warn(`vh_visitors sync: ${error.message}`);
      }
    }

    const homeLayouts = data.homeLayouts && typeof data.homeLayouts === 'object' ? data.homeLayouts : {};
    const fieldSettings =
      data.visitorFieldSettings && typeof data.visitorFieldSettings === 'object'
        ? data.visitorFieldSettings
        : {};
    const orgJsonRows: { organization_id: string; kind: string; payload: unknown; updated_at: string }[] = [];
    for (const [orgId, payload] of Object.entries(homeLayouts as Record<string, unknown>)) {
      orgJsonRows.push({
        organization_id: orgId,
        kind: 'home_layout',
        payload,
        updated_at: new Date().toISOString(),
      });
    }
    for (const [orgId, payload] of Object.entries(fieldSettings as Record<string, unknown>)) {
      orgJsonRows.push({
        organization_id: orgId,
        kind: 'visitor_field_settings',
        payload,
        updated_at: new Date().toISOString(),
      });
    }
    if (orgJsonRows.length) {
      const { error } = await sb.from('vh_org_json').upsert(orgJsonRows, {
        onConflict: 'organization_id,kind',
      });
      if (error) logger.warn(`vh_org_json sync: ${error.message}`);
    }
  } catch (err) {
    logger.warn(`syncAppStoreToTables: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function syncSubscriptionsToTables(raw: unknown) {
  const sb = admin();
  if (!sb || !raw || typeof raw !== 'object') return;
  const subs = Array.isArray((raw as any).subscriptions) ? (raw as any).subscriptions : [];
  if (!subs.length) return;
  const rows = subs.map((s: any) => ({
    id: s.id,
    organization_id: s.organizationId || null,
    raw: s,
    paid_at: s.paidAt || null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from('vh_org_subscriptions').upsert(rows, { onConflict: 'id' });
  if (error) logger.warn(`vh_org_subscriptions sync: ${error.message}`);
}

export async function syncPlansToTables(raw: unknown) {
  const sb = admin();
  if (!sb || !raw || typeof raw !== 'object') return;
  const plans = Array.isArray((raw as any).plans) ? (raw as any).plans : [];
  if (!plans.length) return;
  const rows = plans.map((p: any) => ({
    id: p.id,
    raw: p,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from('vh_subscription_plans').upsert(rows, { onConflict: 'id' });
  if (error) logger.warn(`vh_subscription_plans sync: ${error.message}`);
}

export async function syncBusinessTypesToTables(raw: unknown) {
  const sb = admin();
  if (!sb) return;
  const types = Array.isArray((raw as any)?.types)
    ? (raw as any).types
    : Array.isArray(raw)
      ? raw
      : [];
  if (!types.length) return;
  const rows = types.map((name: string, i: number) => ({
    name: String(name),
    sort_order: i,
  }));
  const { error } = await sb.from('vh_business_types').upsert(rows, { onConflict: 'name' });
  if (error) logger.warn(`vh_business_types sync: ${error.message}`);
}

export async function syncContactMessages(raw: unknown) {
  const sb = admin();
  if (!sb) return;
  const items = Array.isArray((raw as any)?.messages) ? (raw as any).messages : [];
  if (!items.length) return;
  const rows = items.map((m: any) => ({
    id: m.id,
    raw: m,
    created_at: m.createdAt || new Date().toISOString(),
  }));
  const { error } = await sb.from('vh_contact_messages').upsert(rows, { onConflict: 'id' });
  if (error) logger.warn(`vh_contact_messages sync: ${error.message}`);
}

export async function syncHelpMessages(raw: unknown) {
  const sb = admin();
  if (!sb) return;
  const items = Array.isArray((raw as any)?.messages) ? (raw as any).messages : [];
  if (!items.length) return;
  const rows = items.map((m: any) => ({
    id: m.id,
    raw: m,
    created_at: m.createdAt || new Date().toISOString(),
  }));
  const { error } = await sb.from('vh_help_messages').upsert(rows, { onConflict: 'id' });
  if (error) logger.warn(`vh_help_messages sync: ${error.message}`);
}

export async function syncLegalPages(raw: unknown) {
  const sb = admin();
  if (!sb) return;
  const pages = Array.isArray((raw as any)?.pages) ? (raw as any).pages : [];
  if (!pages.length) return;
  const rows = pages.map((p: any) => ({
    slug: p.slug,
    raw: p,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from('vh_legal_pages').upsert(rows, { onConflict: 'slug' });
  if (error) logger.warn(`vh_legal_pages sync: ${error.message}`);
}

export async function syncPayments(raw: unknown) {
  const sb = admin();
  if (!sb) return;
  const payments = Array.isArray((raw as any)?.payments) ? (raw as any).payments : [];
  if (!payments.length) return;
  const rows = payments.map((p: any) => ({
    id: p.id,
    organization_id: p.organizationId || null,
    raw: p,
    paid_at: p.paidAt || null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from('vh_payments').upsert(rows, { onConflict: 'id' });
  if (error) logger.warn(`vh_payments sync: ${error.message}`);
}
