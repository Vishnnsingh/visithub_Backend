/** Org dashboard paths staff may be granted. Add Staff stays org_admin only. */
export const STAFF_DASHBOARD_PAGES = [
  '/admin',
  '/plan',
  '/organisation',
  '/qr-codes',
  '/visitor-details',
  '/tickets',
  '/notifications',
  '/home-element',
  '/active-fields',
] as const;

export type StaffDashboardPage = (typeof STAFF_DASHBOARD_PAGES)[number];

const ALLOWED = new Set<string>(STAFF_DASHBOARD_PAGES);

function migratePath(path: string): string {
  if (path === '/dashboard') return '/admin';
  return path;
}

export function normalizeStaffPages(raw: unknown, options?: { legacyFull?: boolean }): string[] {
  if (raw === undefined || raw === null) {
    return options?.legacyFull ? [...STAFF_DASHBOARD_PAGES] : [];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const path = migratePath(item.trim());
    if (!ALLOWED.has(path)) continue;
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

export function staffCanAccessPath(allowedPages: string[] | undefined, pathname: string): boolean {
  const pages = normalizeStaffPages(allowedPages);
  if (!pages.length) return false;
  return pages.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
