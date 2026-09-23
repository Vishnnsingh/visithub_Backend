import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { recordPaymentFromSubscription } from './paymentLedgerStore';

export type OrgSubscription = {
  id: string;
  organizationId: string;
  planId: string | null;
  planName: string;
  months: number;
  priceInr: number;
  currency: 'INR';
  status: 'active' | 'expired';
  startsAt: string;
  endsAt: string;
  paidAt: string;
  paymentMethod: 'dummy';
  invoiceNumber: string;
  createdAt: string;
};

export type OrgCoverageSummary = {
  latest: OrgSubscription | null;
  activePlans: OrgSubscription[];
  activePlanCount: number;
  totalMonths: number;
  coverageEndsAt: string | null;
  coverageStartsAt: string | null;
};

type StoreFile = {
  subscriptions: OrgSubscription[];
  invoiceSeq: number;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'org-subscriptions.json');

function now() {
  return new Date().toISOString();
}

function ensureStore(): StoreFile {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreFile = { subscriptions: [], invoiceSeq: 1000 };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreFile;
    if (Array.isArray(raw.subscriptions)) {
      return {
        subscriptions: raw.subscriptions,
        invoiceSeq: typeof raw.invoiceSeq === 'number' ? raw.invoiceSeq : 1000,
      };
    }
  } catch {
    /* fall through */
  }
  const fallback: StoreFile = { subscriptions: [], invoiceSeq: 1000 };
  fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
  return fallback;
}

function writeStore(store: StoreFile) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Continuous coverage chain: walk back from newest purchase while each
 * next purchase happened before the previous plan's endsAt (extend, not a gap).
 */
export function getCoverageChain(orgSubs: OrgSubscription[]): OrgSubscription[] {
  if (orgSubs.length === 0) return [];
  const sorted = [...orgSubs].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const chain: OrgSubscription[] = [sorted[sorted.length - 1]];
  for (let i = sorted.length - 2; i >= 0; i -= 1) {
    const prev = sorted[i];
    const next = sorted[i + 1];
    if (new Date(next.paidAt).getTime() <= new Date(prev.endsAt).getTime()) {
      chain.unshift(prev);
    } else {
      break;
    }
  }
  return chain;
}

function orgIds(store: StoreFile): string[] {
  return [...new Set(store.subscriptions.map((s) => s.organizationId))];
}

/**
 * While coverage is live (max stacked endsAt > now), every plan in the
 * continuous extend chain stays `active`. When final expiry passes, all expire.
 */
function refreshStatuses(store: StoreFile): StoreFile {
  const ts = Date.now();
  let changed = false;

  for (const organizationId of orgIds(store)) {
    const orgSubs = store.subscriptions.filter((s) => s.organizationId === organizationId);
    const chain = getCoverageChain(orgSubs);
    if (chain.length === 0) continue;

    const coverageEnd = Math.max(...chain.map((s) => new Date(s.endsAt).getTime()));
    const shouldBeActive = coverageEnd > ts;
    const chainIds = new Set(chain.map((s) => s.id));

    for (const sub of orgSubs) {
      if (chainIds.has(sub.id)) {
        const nextStatus: OrgSubscription['status'] = shouldBeActive ? 'active' : 'expired';
        if (sub.status !== nextStatus) {
          sub.status = nextStatus;
          changed = true;
        }
      } else if (sub.status === 'active') {
        sub.status = 'expired';
        changed = true;
      }
    }
  }

  if (changed) writeStore(store);
  return store;
}

export function addMonths(isoStart: string, months: number): string {
  const d = new Date(isoStart);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export function listOrgSubscriptions(organizationId: string): OrgSubscription[] {
  const store = refreshStatuses(ensureStore());
  return store.subscriptions
    .filter((s) => s.organizationId === organizationId)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function getSubscriptionById(id: string): OrgSubscription | null {
  const store = refreshStatuses(ensureStore());
  return store.subscriptions.find((s) => s.id === id) || null;
}

export function getOrgCoverage(organizationId: string): OrgCoverageSummary {
  const list = listOrgSubscriptions(organizationId);
  const chain = getCoverageChain(list);
  const activePlans = chain.filter((s) => s.status === 'active');
  if (activePlans.length === 0) {
    return {
      latest: null,
      activePlans: [],
      activePlanCount: 0,
      totalMonths: 0,
      coverageEndsAt: null,
      coverageStartsAt: null,
    };
  }

  const latest = [...activePlans].sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
  const coverageEndsAt = activePlans.reduce(
    (max, s) => (s.endsAt > max ? s.endsAt : max),
    activePlans[0].endsAt
  );
  const coverageStartsAt = activePlans.reduce(
    (min, s) => (s.startsAt < min ? s.startsAt : min),
    activePlans[0].startsAt
  );

  return {
    latest,
    activePlans: [...activePlans].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    activePlanCount: activePlans.length,
    totalMonths: activePlans.reduce((sum, s) => sum + s.months, 0),
    coverageEndsAt,
    coverageStartsAt,
  };
}

export function getActiveSubscription(organizationId: string): OrgSubscription | null {
  return getOrgCoverage(organizationId).latest;
}

export function isOrgSubscriptionActive(organizationId: string | null | undefined): boolean {
  if (!organizationId) return false;
  return Boolean(getActiveSubscription(organizationId));
}

export function purchaseSubscription(input: {
  organizationId: string;
  planId: string | null;
  planName: string;
  months: number;
  priceInr: number;
}): OrgSubscription {
  const store = refreshStatuses(ensureStore());
  const paidAt = now();
  const months = Math.max(1, Math.floor(input.months));
  const invoiceSeq = store.invoiceSeq + 1;
  const invoiceNumber = `VH-${new Date().getFullYear()}-${String(invoiceSeq).padStart(5, '0')}`;

  // Extend from furthest active coverage end; keep prior plans active (do not expire them).
  const orgSubs = store.subscriptions.filter((s) => s.organizationId === input.organizationId);
  const activeChain = getCoverageChain(orgSubs).filter((s) => s.status === 'active');
  const coverageEnd = activeChain.reduce<string | null>((max, s) => {
    if (!max || s.endsAt > max) return s.endsAt;
    return max;
  }, null);
  const hasLiveCoverage = Boolean(coverageEnd && new Date(coverageEnd).getTime() > Date.now());

  const startsAt = paidAt;
  const endsAt = addMonths(hasLiveCoverage && coverageEnd ? coverageEnd : paidAt, months);

  const record: OrgSubscription = {
    id: randomUUID(),
    organizationId: input.organizationId,
    planId: input.planId,
    planName: input.planName,
    months,
    priceInr: Math.max(0, Math.round(input.priceInr)),
    currency: 'INR',
    status: 'active',
    startsAt,
    endsAt,
    paidAt,
    paymentMethod: 'dummy',
    invoiceNumber,
    createdAt: paidAt,
  };

  store.invoiceSeq = invoiceSeq;
  store.subscriptions.push(record);
  writeStore(store);
  // Re-run so prior plans in the extend chain stay/revive as active together.
  const saved =
    refreshStatuses(ensureStore()).subscriptions.find((s) => s.id === record.id) || record;

  try {
    recordPaymentFromSubscription(saved);
  } catch {
    /* non-fatal — subscription still saved */
  }

  return saved;
}

export function listAllSubscriptions(): OrgSubscription[] {
  return refreshStatuses(ensureStore())
    .subscriptions.slice()
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

/** Seed / manual activate for a known org (e.g. testing). */
export function ensureActivePlanForOrg(input: {
  organizationId: string;
  planId: string | null;
  planName: string;
  months: number;
  priceInr: number;
}): OrgSubscription {
  const existing = getActiveSubscription(input.organizationId);
  if (existing) return existing;
  return purchaseSubscription(input);
}
