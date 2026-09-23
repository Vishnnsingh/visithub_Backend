export const VISITOR_FIELD_KEYS = [
  'date',
  'email',
  'visitorName',
  'mobileNumber',
  'addressCompany',
  'personToMeet',
  'department',
  'purpose',
  'inTime',
  'outTime',
  'vehicleNumber',
  'remarks',
  'visitorSignature',
  'aadhaarFront',
  'aadhaarBack',
  'selfie',
  'outPhoto',
  'rating',
] as const;

export type VisitorFieldKey = (typeof VISITOR_FIELD_KEYS)[number];

export type VisitorFieldType = 'text' | 'date' | 'time' | 'tel' | 'textarea' | 'signature' | 'photo' | 'upload' | 'number' | 'alpha' | 'mix';

export type CustomVisitorFieldType = 'text' | 'tel' | 'textarea' | 'number' | 'alpha' | 'mix' | 'upload' | 'photo';

export type VisitorFieldDef = {
  key: VisitorFieldKey;
  label: string;
  type: VisitorFieldType;
  group: 'default' | 'extra';
  defaultShow: boolean;
};

export type CustomVisitorField = {
  key: string;
  label: string;
  type: CustomVisitorFieldType;
  stage?: 'checkin' | 'checkout';
};

export type VisitorFieldConfig = {
  show: Record<string, boolean>;
  required: Record<string, boolean>;
  labels: Record<string, string>;
  custom: CustomVisitorField[];
  order: string[];
};

export const VISITOR_FIELDS: VisitorFieldDef[] = [
  { key: 'date', label: 'Date', type: 'date', group: 'default', defaultShow: true },
  { key: 'email', label: 'Email', type: 'text', group: 'default', defaultShow: true },
  { key: 'visitorName', label: 'Visitor name', type: 'text', group: 'default', defaultShow: true },
  { key: 'mobileNumber', label: 'Mobile number', type: 'tel', group: 'default', defaultShow: true },
  { key: 'addressCompany', label: 'Address / company name', type: 'text', group: 'default', defaultShow: true },
  { key: 'personToMeet', label: 'Person to meet', type: 'text', group: 'default', defaultShow: true },
  { key: 'department', label: 'Department / room / flat no.', type: 'text', group: 'default', defaultShow: true },
  { key: 'purpose', label: 'Purpose of visit', type: 'text', group: 'default', defaultShow: true },
  { key: 'inTime', label: 'In time', type: 'time', group: 'default', defaultShow: true },
  { key: 'outTime', label: 'Out time', type: 'time', group: 'default', defaultShow: true },
  { key: 'selfie', label: 'Selfie', type: 'photo', group: 'extra', defaultShow: true },
  { key: 'vehicleNumber', label: 'Vehicle number', type: 'text', group: 'extra', defaultShow: false },
  { key: 'remarks', label: 'Remarks', type: 'textarea', group: 'extra', defaultShow: false },
  { key: 'visitorSignature', label: 'Visitor signature', type: 'signature', group: 'extra', defaultShow: false },
  { key: 'aadhaarFront', label: 'Aadhaar photo — front', type: 'photo', group: 'extra', defaultShow: false },
  { key: 'aadhaarBack', label: 'Aadhaar photo — back', type: 'photo', group: 'extra', defaultShow: false },
  { key: 'outPhoto', label: 'Out gate photo', type: 'photo', group: 'extra', defaultShow: false },
  { key: 'rating', label: 'Meeting rating', type: 'text', group: 'extra', defaultShow: false },
];

export const DEFAULT_VISITOR_FIELD_SHOW = Object.fromEntries(
  VISITOR_FIELDS.map((field) => [field.key, field.defaultShow])
) as Record<VisitorFieldKey, boolean>;

const CUSTOM_TYPES = new Set<CustomVisitorFieldType>(['text', 'tel', 'textarea', 'number', 'alpha', 'mix', 'upload', 'photo']);

export function isVisitorFieldKey(value: string): value is VisitorFieldKey {
  return VISITOR_FIELD_KEYS.includes(value as VisitorFieldKey);
}

export function isCustomFieldKey(value: string): boolean {
  return /^c_[a-z0-9]{6,32}$/i.test(value) && !isVisitorFieldKey(value);
}

export function isCustomFieldType(value: string): value is CustomVisitorFieldType {
  return CUSTOM_TYPES.has(value as CustomVisitorFieldType);
}

export const CHECKOUT_FIELD_KEYS = ['outTime', 'remarks', 'visitorSignature', 'outPhoto', 'rating'] as const;

export function isCheckoutFieldKey(key: string) {
  return (CHECKOUT_FIELD_KEYS as readonly string[]).includes(key);
}

export function fieldStageOf(key: string, stage?: string | null): 'checkin' | 'checkout' {
  if (stage === 'checkout' || stage === 'checkin') return stage;
  return isCheckoutFieldKey(key) ? 'checkout' : 'checkin';
}

export const AUTO_FIELD_KEYS = new Set(['date', 'inTime', 'outTime', 'email']);

export function defaultFieldRequired(key: string) {
  return ['visitorName', 'mobileNumber', 'addressCompany', 'personToMeet', 'department', 'purpose'].includes(key);
}

export function isCustomFileType(type: string) {
  return type === 'photo' || type === 'upload';
}

export function sortFieldsByOrder<T extends { key: string }>(fields: T[], order: string[]): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...fields].sort((a, b) => {
    const left = rank.has(a.key) ? rank.get(a.key)! : order.length + 50;
    const right = rank.has(b.key) ? rank.get(b.key)! : order.length + 50;
    return left - right;
  });
}

export function defaultFieldOrder(customKeys: string[] = []): string[] {
  return [...VISITOR_FIELDS.filter((field) => field.key !== 'outTime').map((field) => field.key), ...customKeys];
}

export function completeFieldOrder(order: string[], keys: string[]): string[] {
  const allowed = new Set(keys);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const key of order) {
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  return next;
}

export function customFieldValueError(type: string, value: string, label: string): string | null {
  if (!value) return null;
  if (type === 'number' && !/^\d+$/.test(value)) return `${label} accepts numbers only`;
  if (type === 'alpha' && !/^[A-Za-z\s]+$/.test(value)) return `${label} accepts letters only`;
  if (type === 'mix' && !/^[A-Za-z0-9\s]+$/.test(value)) return `${label} accepts letters and numbers only`;
  return null;
}

function asBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'boolean') next[key] = item;
  }
  return next;
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && item.trim()) next[key] = item.trim();
  }
  return next;
}

export function normalizeFieldConfig(raw: unknown): VisitorFieldConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { show: {}, required: {}, labels: {}, custom: [], order: [] };
  }
  const source = raw as Record<string, unknown>;
  const nested = 'show' in source || 'labels' in source || 'custom' in source || 'order' in source || 'required' in source;
  const show = asBooleanMap(nested ? source.show : source);
  const required = nested ? asBooleanMap(source.required) : {};
  const labels = nested ? asStringMap(source.labels) : {};
  const customRaw = nested && Array.isArray(source.custom) ? source.custom : [];
  const custom: CustomVisitorField[] = [];
  const seen = new Set<string>();
  for (const item of customRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const field = item as Record<string, unknown>;
    const key = typeof field.key === 'string' ? field.key.trim() : '';
    const label = typeof field.label === 'string' ? field.label.trim() : '';
    const rawType = typeof field.type === 'string' ? field.type : 'mix';
    const type = isCustomFieldType(rawType) ? rawType : 'mix';
    if (!isCustomFieldKey(key) || !label || seen.has(key)) continue;
    seen.add(key);
    custom.push({ key, label, type, stage: fieldStageOf(key, typeof field.stage === 'string' ? field.stage : '') });
  }
  const order = Array.isArray(source.order)
    ? source.order.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
  return { show, required, labels, custom, order };
}
