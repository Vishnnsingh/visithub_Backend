import path from 'path';
import { randomUUID } from 'crypto';
import { loadJsonStore, saveJsonStore } from './jsonPersist';

export type SubscriptionPlan = {
  id: string;
  name: string;
  months: number;
  priceInr: number;
  currency: string;
  description: string;
  features: string[];
  highlighted: boolean;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};

type PlansFile = {
  plans: SubscriptionPlan[];
};

const STORE_PATH = path.join(process.cwd(), 'data', 'subscription-plans.json');

function now() {
  return new Date().toISOString();
}

function defaultPlans(): SubscriptionPlan[] {
  const stamp = now();
  return [
    {
      id: randomUUID(),
      name: '1 Month',
      months: 1,
      priceInr: 500,
      currency: 'INR',
      description: 'Try Kavion Feedback for one organisation.',
      features: [
        'QR visitor check-in',
        'Tickets & meetings',
        'Staff accounts',
        'Public home page',
        'Email support',
      ],
      highlighted: false,
      active: true,
      sortOrder: 1,
      updatedAt: stamp,
    },
    {
      id: randomUUID(),
      name: '6 Months',
      months: 6,
      priceInr: 2700,
      currency: 'INR',
      description: 'Best for schools and offices that run year-round visits.',
      features: [
        'Everything in 1 Month',
        'Home Element builder',
        'Active Fields control',
        'Push notifications',
        'Priority support',
      ],
      highlighted: true,
      active: true,
      sortOrder: 2,
      updatedAt: stamp,
    },
    {
      id: randomUUID(),
      name: '1 Year',
      months: 12,
      priceInr: 4800,
      currency: 'INR',
      description: 'Full-year visitor operations for one organisation.',
      features: [
        'Everything in 6 Months',
        'Unlimited QR gates',
        'Visitor history & reports',
        'Google review on Home',
        'Dedicated onboarding help',
      ],
      highlighted: false,
      active: true,
      sortOrder: 3,
      updatedAt: stamp,
    },
    {
      id: randomUUID(),
      name: 'Custom',
      months: 0,
      priceInr: 0,
      currency: 'INR',
      description:
        'Need a special duration, multi-branch setup, or tailored features? We’ll build a plan for you.',
      features: [
        'Flexible duration',
        'Multi-branch / multi-org options',
        'Custom fields & workflows',
        'Priority onboarding',
        'Dedicated support',
      ],
      highlighted: false,
      active: true,
      sortOrder: 4,
      updatedAt: stamp,
    },
  ];
}

function emptyStore(): PlansFile {
  return { plans: defaultPlans() };
}

function ensureFile(): PlansFile {
  try {
    const raw = loadJsonStore<PlansFile>(STORE_PATH, emptyStore());
    if (!Array.isArray(raw.plans) || !raw.plans.length) {
      const initial = emptyStore();
      saveJsonStore(STORE_PATH, initial);
      return initial;
    }
    return raw;
  } catch {
    const initial = emptyStore();
    saveJsonStore(STORE_PATH, initial);
    return initial;
  }
}

function writeFile(data: PlansFile) {
  saveJsonStore(STORE_PATH, data);
}

export function listSubscriptionPlans(activeOnly = false) {
  const data = ensureFile();
  const plans = [...data.plans].sort((a, b) => a.sortOrder - b.sortOrder || a.months - b.months);
  return activeOnly ? plans.filter((plan) => plan.active) : plans;
}

export function createSubscriptionPlan(input: {
  name: string;
  months: number;
  priceInr: number;
  description?: string;
  features?: string[];
  highlighted?: boolean;
  active?: boolean;
}) {
  const data = ensureFile();
  const plan: SubscriptionPlan = {
    id: randomUUID(),
    name: input.name.trim(),
    months: Math.max(0, Math.round(input.months)),
    priceInr: Math.max(0, Math.round(input.priceInr)),
    currency: 'INR',
    description: (input.description || '').trim(),
    features: (input.features || []).map((item) => item.trim()).filter(Boolean),
    highlighted: Boolean(input.highlighted),
    active: input.active !== false,
    sortOrder: data.plans.length + 1,
    updatedAt: now(),
  };
  data.plans.push(plan);
  writeFile(data);
  return plan;
}

export function updateSubscriptionPlan(
  id: string,
  patch: Partial<{
    name: string;
    months: number;
    priceInr: number;
    description: string;
    features: string[];
    highlighted: boolean;
    active: boolean;
    sortOrder: number;
  }>
) {
  const data = ensureFile();
  const index = data.plans.findIndex((plan) => plan.id === id);
  if (index < 0) return null;
  const current = data.plans[index];
  const next: SubscriptionPlan = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    months: patch.months !== undefined ? Math.max(0, Math.round(patch.months)) : current.months,
    priceInr: patch.priceInr !== undefined ? Math.max(0, Math.round(patch.priceInr)) : current.priceInr,
    description: patch.description !== undefined ? patch.description.trim() : current.description,
    features:
      patch.features !== undefined
        ? patch.features.map((item) => item.trim()).filter(Boolean)
        : current.features,
    highlighted: patch.highlighted !== undefined ? Boolean(patch.highlighted) : current.highlighted,
    active: patch.active !== undefined ? Boolean(patch.active) : current.active,
    sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) : current.sortOrder,
    updatedAt: now(),
  };
  data.plans[index] = next;
  writeFile(data);
  return next;
}

export function deleteSubscriptionPlan(id: string) {
  const data = ensureFile();
  const next = data.plans.filter((plan) => plan.id !== id);
  if (next.length === data.plans.length) return false;
  data.plans = next;
  writeFile(data);
  return true;
}
