import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { findOrganizationById, findUserById } from './appStore';
import type { OrgSubscription } from './subscriptionStore';

export type PaymentGateway = 'dummy' | 'razorpay' | 'stripe' | 'payu' | 'other';

export type PaymentRecord = {
  id: string;
  subscriptionId: string;
  organizationId: string;
  organizationName: string;
  businessType: string;
  adminName: string;
  adminEmail: string;
  planName: string;
  months: number;
  /** Amount charged to organisation */
  grossAmountInr: number;
  /** Gateway fee % applied at purchase time */
  gatewayFeePercent: number;
  /** Fee deducted by gateway */
  gatewayFeeInr: number;
  /** Amount after gateway deduction */
  netAmountInr: number;
  currency: 'INR';
  gateway: PaymentGateway;
  gatewayPaymentId: string | null;
  gatewayOrderId: string | null;
  status: 'success' | 'failed' | 'pending' | 'refunded';
  paidAt: string;
  invoiceNumber: string;
  createdAt: string;
};

type GatewaySettings = {
  /** Default fee % until real gateway config exists */
  feePercent: number;
  gateway: PaymentGateway;
  updatedAt: string;
};

type StoreFile = {
  payments: PaymentRecord[];
  settings: GatewaySettings;
};

const STORE_PATH = path.join(process.cwd(), 'data', 'payment-ledger.json');

function now() {
  return new Date().toISOString();
}

function defaultSettings(): GatewaySettings {
  return {
    feePercent: 2,
    gateway: 'dummy',
    updatedAt: now(),
  };
}

function ensureStore(): StoreFile {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreFile = { payments: [], settings: defaultSettings() };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreFile;
    return {
      payments: Array.isArray(raw.payments) ? raw.payments : [],
      settings: {
        feePercent:
          typeof raw.settings?.feePercent === 'number' && raw.settings.feePercent >= 0
            ? raw.settings.feePercent
            : 2,
        gateway: (raw.settings?.gateway as PaymentGateway) || 'dummy',
        updatedAt: String(raw.settings?.updatedAt || now()),
      },
    };
  } catch {
    const fallback: StoreFile = { payments: [], settings: defaultSettings() };
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function writeStore(store: StoreFile) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function getPaymentGatewaySettings(): GatewaySettings {
  return ensureStore().settings;
}

export function setPaymentGatewaySettings(input: {
  feePercent?: number;
  gateway?: PaymentGateway;
}): GatewaySettings {
  const store = ensureStore();
  if (input.feePercent !== undefined) {
    const n = Number(input.feePercent);
    if (!Number.isFinite(n) || n < 0 || n > 30) throw new Error('Fee percent must be 0–30');
    store.settings.feePercent = Math.round(n * 100) / 100;
  }
  if (input.gateway) store.settings.gateway = input.gateway;
  store.settings.updatedAt = now();
  writeStore(store);
  return store.settings;
}

function computeFees(gross: number, feePercent: number) {
  const grossAmountInr = Math.max(0, Math.round(gross));
  const gatewayFeeInr = Math.max(0, Math.round((grossAmountInr * feePercent) / 100));
  const netAmountInr = Math.max(0, grossAmountInr - gatewayFeeInr);
  return { grossAmountInr, gatewayFeeInr, netAmountInr };
}

export function recordPaymentFromSubscription(sub: OrgSubscription): PaymentRecord {
  const store = ensureStore();
  const existing = store.payments.find((p) => p.subscriptionId === sub.id);
  if (existing) return existing;

  const org = findOrganizationById(sub.organizationId);
  const admin = org?.adminUserId ? findUserById(org.adminUserId) : null;
  const settings = store.settings;
  const fees = computeFees(sub.priceInr, settings.feePercent);

  const record: PaymentRecord = {
    id: randomUUID(),
    subscriptionId: sub.id,
    organizationId: sub.organizationId,
    organizationName: org?.name || 'Organisation',
    businessType: org?.businessType || '',
    adminName: admin?.fullName || '',
    adminEmail: admin?.email || org?.email || '',
    planName: sub.planName,
    months: sub.months,
    ...fees,
    gatewayFeePercent: settings.feePercent,
    currency: 'INR',
    gateway: settings.gateway,
    gatewayPaymentId: null,
    gatewayOrderId: null,
    status: 'success',
    paidAt: sub.paidAt,
    invoiceNumber: sub.invoiceNumber,
    createdAt: now(),
  };

  store.payments.unshift(record);
  writeStore(store);
  return record;
}

export function getPaymentById(id: string): PaymentRecord | null {
  return ensureStore().payments.find((p) => p.id === id) || null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function inPeriod(paidAt: string, period: 'day' | 'month' | 'all', ref = new Date()) {
  if (period === 'all') return true;
  const paid = new Date(paidAt);
  if (period === 'day') {
    return startOfDay(paid).getTime() === startOfDay(ref).getTime();
  }
  return paid.getFullYear() === ref.getFullYear() && paid.getMonth() === ref.getMonth();
}

export function listPayments(input: {
  page?: number;
  limit?: number;
  period?: 'day' | 'month' | 'all';
}) {
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(input.limit) || 10));
  const period = input.period === 'day' || input.period === 'month' ? input.period : 'all';
  const all = ensureStore()
    .payments.filter((p) => inPeriod(p.paidAt, period))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;
  return {
    items: all.slice(start, start + limit),
    page: safePage,
    pages,
    total,
    limit,
    period,
  };
}

export function getPaymentStats() {
  const payments = ensureStore().payments.filter((p) => p.status === 'success');
  const sum = (list: PaymentRecord[]) => ({
    count: list.length,
    grossInr: list.reduce((s, p) => s + p.grossAmountInr, 0),
    gatewayFeeInr: list.reduce((s, p) => s + p.gatewayFeeInr, 0),
    netInr: list.reduce((s, p) => s + p.netAmountInr, 0),
  });

  const today = payments.filter((p) => inPeriod(p.paidAt, 'day'));
  const month = payments.filter((p) => inPeriod(p.paidAt, 'month'));

  return {
    today: sum(today),
    month: sum(month),
    all: sum(payments),
    settings: getPaymentGatewaySettings(),
  };
}

/** Backfill ledger from existing subscriptions (one-time safe) */
export function backfillPaymentsFromSubscriptions(subs: OrgSubscription[]) {
  for (const sub of subs) {
    recordPaymentFromSubscription(sub);
  }
}
