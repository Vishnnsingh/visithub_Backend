import { randomUUID } from 'crypto';
import env from '../config/env';
import AppError from '../utils/AppError';
import { now, indiaDateTime, addIndiaDays, stayDurationLabel } from '../utils/helpers';
import { assertVisitorGoogle, assertVisitorGoogleSignature, PHONE_SESSION_SUBJECT, signVisitorGoogle, verifyGoogleIdToken } from '../utils/googleAuth';
import {
  addVisitor,
  addMeetingPerson,
  removeMeetingPerson,
  expireGoogleVisitorSession,
  findOrganizationById,
  findQrCodeByPublicCode,
  findRoleById,
  findVisitorById,
  getGoogleSessionValidAfter,
  getMeetingDay,
  getVisitorFieldSettings,
  listMeetingPeople,
  listQrCodesByOrg,
  listVisitorsByOrg,
  listVisitorsByOrgEmail,
  listVisitorsByOrgMobile,
  listVisitorsByOrgUid,
  normName,
  saveVisitorFieldSettings,
  setMeetingPersonStatus,
  uniqueVisitorUid,
  updateOrganization,
  updateVisitor,
  savePushSubscription,
} from '../data/appStore';
import { emitToOrg, emitToVisitor } from '../sockets/bus';
import { sendVisitorPush, vapidPublicKey, type VisitNotice } from '../utils/webPush';
import { toPublicHomeLayout } from './homeElement.service';
import { buildGoogleReviewLink } from './org.service';
import type { AuthUser, MeetingAvailability, StoredOrganization, StoredVisitor, VisitorFieldSettings } from '../types/auth';
import {
  DEFAULT_VISITOR_FIELD_SHOW,
  VISITOR_FIELDS,
  isCustomFieldKey,
  isCustomFieldType,
  normalizeFieldConfig,
  sortFieldsByOrder,
  defaultFieldOrder,
  completeFieldOrder,
  customFieldValueError,
  isCustomFileType,
  fieldStageOf,
  defaultFieldRequired,
  AUTO_FIELD_KEYS,
  type CustomVisitorFieldType,
  type VisitorFieldKey,
  type VisitorFieldType,
} from '../utils/visitorFields';

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeMobile(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits || null;
}

function continueWithOf(organizationId: string) {
  const raw = getVisitorFieldSettings(organizationId) as VisitorFieldSettings;
  return {
    google: raw.continueWith?.google !== false,
    number: raw.continueWith?.number !== false,
  };
}

type ResolvedField = {
  key: string;
  label: string;
  type: VisitorFieldType;
  group: 'default' | 'extra';
  showOnWebApp: boolean;
  custom: boolean;
  stage: 'checkin' | 'checkout';
  required: boolean;
};

type AdminFieldInput = {
  key: string;
  label: string;
  showOnWebApp: boolean;
  type?: string;
  custom?: boolean;
  stage?: string;
  required?: boolean;
};

function orgFieldConfig(organizationId: string) {
  return normalizeFieldConfig(getVisitorFieldSettings(organizationId));
}

function resolveOrgFields(organizationId: string): ResolvedField[] {
  const stored = orgFieldConfig(organizationId);
  const builtIn = VISITOR_FIELDS.map((field) => ({
    key: field.key,
    label: stored.labels[field.key] || field.label,
    type: field.type,
    group: field.group,
    showOnWebApp: typeof stored.show[field.key] === 'boolean' ? stored.show[field.key] : field.defaultShow,
    custom: false,
    stage: fieldStageOf(field.key),
    required: AUTO_FIELD_KEYS.has(field.key)
      ? false
      : typeof stored.required[field.key] === 'boolean'
        ? stored.required[field.key]
        : defaultFieldRequired(field.key),
  }));
  const custom = stored.custom.map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type as VisitorFieldType,
    group: 'extra' as const,
    showOnWebApp: typeof stored.show[field.key] === 'boolean' ? stored.show[field.key] : true,
    custom: true,
    stage: fieldStageOf(field.key, field.stage),
    required: typeof stored.required[field.key] === 'boolean' ? stored.required[field.key] : false,
  }));
  const all = [...builtIn, ...custom];
  const order = completeFieldOrder(
    stored.order.length ? stored.order : defaultFieldOrder(custom.map((field) => field.key)),
    all.map((field) => field.key)
  );
  return sortFieldsByOrder(all, order);
}

function requireOrg(organizationId: string | null | undefined) {
  if (!organizationId) throw new AppError('Organisation context is required', 403);
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  return organization;
}

export function resolveFieldShow(organizationId: string): Record<VisitorFieldKey, boolean> {
  const stored = orgFieldConfig(organizationId);
  const resolved = { ...DEFAULT_VISITOR_FIELD_SHOW };
  for (const field of VISITOR_FIELDS) {
    if (typeof stored.show[field.key] === 'boolean') resolved[field.key] = stored.show[field.key];
  }
  return resolved;
}

export function getAdminFields(organizationId: string | null | undefined) {
  const organization = requireOrg(organizationId);
  return {
    fields: resolveOrgFields(organization.id).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      group: field.group,
      showOnWebApp: field.showOnWebApp,
      custom: field.custom,
      stage: field.stage,
      required: field.required,
    })),
    continueWith: continueWithOf(organization.id),
  };
}

export function updateAdminFields(
  organizationId: string | null | undefined,
  fields: AdminFieldInput[],
  continueWithInput?: { google: boolean; number: boolean }
) {
  const organization = requireOrg(organizationId);
  const current = resolveOrgFields(organization.id);
  const incoming = Array.isArray(fields) ? fields : [];
  const byKey = new Map(incoming.map((field) => [field.key, field]));

  const show: Record<string, boolean> = {};
  const requiredMap: Record<string, boolean> = {};
  const labels: Record<string, string> = {};

  for (const field of VISITOR_FIELDS) {
    const next = byKey.get(field.key);
    const currentField = current.find((item) => item.key === field.key);
    const label = (next?.label || currentField?.label || field.label).trim();
    if (!label) throw new AppError(`${field.label} name is required`, 400);
    show[field.key] = field.key === 'email' ? true : typeof next?.showOnWebApp === 'boolean' ? next.showOnWebApp : Boolean(currentField?.showOnWebApp);
    requiredMap[field.key] = AUTO_FIELD_KEYS.has(field.key)
      ? false
      : typeof next?.required === 'boolean'
        ? next.required
        : Boolean(currentField?.required);
    if (label !== field.label) labels[field.key] = label.slice(0, 80);
  }

  const custom = incoming
    .filter((field) => field.custom || isCustomFieldKey(field.key))
    .map((field) => {
      const key = String(field.key || '').trim();
      const label = String(field.label || '').trim();
      const type: CustomVisitorFieldType = isCustomFieldType(String(field.type || ''))
        ? (field.type as CustomVisitorFieldType)
        : 'mix';
      if (!isCustomFieldKey(key)) throw new AppError('Custom field key is not valid', 400);
      if (!label) throw new AppError('Custom field name is required', 400);
      show[key] = Boolean(field.showOnWebApp);
      requiredMap[key] = Boolean(field.required);
      labels[key] = label.slice(0, 80);
      return { key, label: label.slice(0, 80), type, stage: fieldStageOf(key, field.stage) };
    });

  const unique = new Set(custom.map((field) => field.key));
  if (unique.size !== custom.length) throw new AppError('Custom field names must be unique', 400);
  if (custom.length > 20) throw new AppError('You can add up to 20 extra fields', 400);

  const order = completeFieldOrder(
    incoming.map((field) => field.key),
    [...VISITOR_FIELDS.map((field) => field.key), ...custom.map((field) => field.key)]
  );
  const previous = (getVisitorFieldSettings(organization.id) as VisitorFieldSettings).continueWith;
  const continueWith = continueWithInput
    ? { google: Boolean(continueWithInput.google), number: Boolean(continueWithInput.number) }
    : previous || { google: true, number: true };
  const settings: VisitorFieldSettings = { show, labels, custom, order, required: requiredMap, continueWith };
  saveVisitorFieldSettings(organization.id, settings);
  return getAdminFields(organization.id);
}

function enabledEntryFields(organizationId: string) {
  return resolveOrgFields(organizationId).filter(
    (field) =>
      field.stage === 'checkin' &&
      field.key !== 'selfie' &&
      field.showOnWebApp
  );
}

function enabledCheckoutFields(organizationId: string) {
  return resolveOrgFields(organizationId).filter(
    (field) => field.stage === 'checkout' && field.key !== 'outTime' && field.key !== 'rating' && field.showOnWebApp
  );
}

export function getPublicVisit(publicCode: string) {
  const qr = findQrCodeByPublicCode(publicCode);
  if (!qr) throw new AppError('QR code not found', 404);
  const organization = findOrganizationById(qr.organizationId);
  if (!organization || !organization.isActive) throw new AppError('Organisation not found', 404);
  autoCloseExpiredVisits(organization.id);
  const india = indiaDateTime();
  const show = resolveFieldShow(organization.id);
  const homeLayout = toPublicHomeLayout(organization.id, organization.name);
  const gates = listQrCodesByOrg(organization.id).map((item) => ({
    label: item.label,
    publicCode: item.publicCode,
  }));
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationLogo: organization.logoFile || null,
    organizationWelcomeImage: organization.welcomeImageFile || null,
    label: qr.label,
    publicCode: qr.publicCode,
    indiaDate: india.date,
    indiaInTime: india.time,
    selfieEnabled: show.selfie,
    selfieRequired: Boolean(resolveOrgFields(organization.id).find((field) => field.key === 'selfie')?.required),
    selfieLabel: resolveOrgFields(organization.id).find((field) => field.key === 'selfie')?.label || 'Selfie',
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    vapidPublicKey: vapidPublicKey(),
    defaultWaitMinutes: defaultWaitMinutesOf(organization),
    continueWithGoogle: continueWithOf(organization.id).google,
    continueWithNumber: continueWithOf(organization.id).number,
    homeLayout,
    meetingBoard: homeLayout.meetingBoardEnabled ? buildMeetingBoard(organization.id) : null,
    googleReview: (() => {
      const url = buildGoogleReviewLink(organization);
      if (!url) return null;
      return {
        enabled: true,
        url,
        label: 'Review on Google',
        hint: 'Tap to open Google Write a review and rate with stars.',
      };
    })(),
    gates,
    meetingPeople: listTodayMeetings(organization.id).items.map((item) => item.name),
    fields: [
      ...enabledEntryFields(organization.id).map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: Boolean(field.required),
        locked: field.key === 'date' || field.key === 'inTime' || field.key === 'email',
        value: field.key === 'date' ? india.date : field.key === 'inTime' ? india.time : undefined,
      })),
    ],
  };
}

/** Public org Home only (no visit / continue) — used after session expire & review */
export function getPublicOrgHome(organizationId: string) {
  const organization = findOrganizationById(organizationId);
  if (!organization || !organization.isActive) throw new AppError('Organisation not found', 404);
  const homeLayout = toPublicHomeLayout(organization.id, organization.name);
  const url = buildGoogleReviewLink(organization);
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationLogo: organization.logoFile || null,
    homeLayout,
    meetingBoard: homeLayout.meetingBoardEnabled ? buildMeetingBoard(organization.id) : null,
    googleReview: url
      ? {
          enabled: true,
          url,
          label: 'Review on Google',
          hint: 'Tap to open Google Write a review and rate with stars.',
        }
      : null,
  };
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function toPublicVisitor(visitor: StoredVisitor) {
  return {
    id: visitor.id,
    visitorUid: visitor.visitorUid || visitor.id,
    label: visitor.label,
    publicCode: visitor.publicCode,
    date: visitor.date,
    visitorName: visitor.visitorName,
    email: visitor.email || null,
    mobileNumber: visitor.mobileNumber,
    addressCompany: visitor.addressCompany,
    personToMeet: visitor.personToMeet,
    department: visitor.department,
    purpose: visitor.purpose,
    vehicleNumber: visitor.vehicleNumber,
    inTime: visitor.inTime,
    outTime: visitor.outTime,
    outLabel: visitor.outLabel || null,
    outPublicCode: visitor.outPublicCode || null,
    duration: stayDurationLabel(visitor.date, visitor.inTime, visitor.outTime),
    signatureFile: visitor.signatureFile,
    remarks: visitor.remarks,
    aadhaarFrontFile: visitor.aadhaarFrontFile,
    aadhaarBackFile: visitor.aadhaarBackFile,
    selfieFile: visitor.selfieFile || null,
    outPhotoFile: visitor.outPhotoFile || null,
    customValues: visitor.customValues || {},
    ticketStatus: ticketStatusOf(visitor),
    declined: visitor.ticketStatus === 'declined',
    closedAt: visitor.closedAt || (visitor.outTime || visitor.ticketStatus === 'closed' || visitor.ticketStatus === 'declined' ? visitor.updatedAt : null),
    waitMinutes: visitor.waitMinutes || null,
    waitStartedAt: visitor.waitStartedAt || null,
    waitEndsAt: visitor.waitEndsAt || null,
    waitSource: visitor.waitSource || null,
    rating: visitor.rating || null,
    ticketId: visitor.visitorUid || visitor.id,
    closedByName: visitor.closedByName || null,
    closedByRole: visitor.closedByRole || null,
    closeType: visitor.closeType || null,
    canForceClose: canForceClose(visitor),
    createdAt: visitor.createdAt,
  };
}

function ticketStatusOf(visitor: StoredVisitor): 'waiting' | 'confirmed' | 'closed' {
  if (visitor.outTime || visitor.ticketStatus === 'closed') return 'closed';
  if (visitor.waitSource === 'default') return 'waiting';
  if (visitor.waitEndsAt || visitor.ticketStatus === 'confirmed') return 'confirmed';
  return 'waiting';
}

function stoppedWaitFields() {
  return {
    waitMinutes: null,
    waitStartedAt: null,
    waitEndsAt: null,
    waitSource: 'manual' as const,
  };
}

function waitFields(minutes: number, source: 'default' | 'manual' = 'manual') {
  const wait = Math.min(180, Math.max(1, Number(minutes) || 0));
  const started = new Date();
  return {
    ticketStatus: (source === 'manual' ? 'confirmed' : 'waiting') as 'confirmed' | 'waiting',
    waitMinutes: wait,
    waitStartedAt: started.toISOString(),
    waitEndsAt: new Date(started.getTime() + wait * 60 * 1000).toISOString(),
    waitSource: source,
  };
}

function defaultWaitMinutesOf(organization: StoredOrganization) {
  if (organization.defaultWaitMinutes === null) return null;
  if (typeof organization.defaultWaitMinutes === 'number' && organization.defaultWaitMinutes > 0) {
    return Math.min(180, organization.defaultWaitMinutes);
  }
  return 10;
}

function applyOpenDefaultWait(organization: StoredOrganization, visitor: StoredVisitor, silent = false) {
  if (visitor.outTime || visitor.ticketStatus === 'closed' || visitor.ticketStatus === 'declined') return visitor;
  if (visitor.waitSource === 'manual') return visitor;
  // Wait until selfie is submitted before starting the visitor counter
  if (resolveFieldShow(organization.id).selfie && !visitor.selfieFile) return visitor;
  const wait = defaultWaitMinutesOf(organization);
  if (!wait || visitor.waitEndsAt) return visitor;
  const updated = updateVisitor(visitor.id, {
    ...waitFields(wait, 'default'),
    ticketStatus: 'waiting',
    updatedAt: now(),
  });
  if (updated && !silent) broadcastVisit(organization.id, updated, timerNotice(wait, 'default'));
  return updated || visitor;
}

function ticketDefaults(organization?: StoredOrganization) {
  const wait = organization ? defaultWaitMinutesOf(organization) : null;
  const deferForSelfie = Boolean(organization && resolveFieldShow(organization.id).selfie);
  if (deferForSelfie || !wait) {
    return {
      ticketStatus: 'waiting' as const,
      waitMinutes: null,
      waitStartedAt: null,
      waitEndsAt: null,
      waitSource: null,
      outPhotoFile: null,
      closedByUserId: null,
      closedByName: null,
      closedByRole: null,
      closeType: null,
      closedAt: null,
      rating: null,
    };
  }
  return {
    ...waitFields(wait, 'default'),
    outPhotoFile: null,
    closedByUserId: null,
    closedByName: null,
    closedByRole: null,
    closeType: null,
    closedAt: null,
    rating: null,
  };
}

function timerNotice(minutes: number, source: 'default' | 'manual'): VisitNotice {
  if (source === 'default') {
    return {
      kind: 'timer',
      title: 'Wait timer started',
      body: `Update shortly timer is ${minutes} min. Tap to open.`,
    };
  }
  return {
    kind: 'timer',
    title: 'Timer updated',
    body: `Your wait time is now ${minutes} min. Tap to open.`,
  };
}

function statusNotice(available: boolean): VisitNotice {
  return available
    ? { kind: 'status', title: 'Available', body: 'The meeting person is available. Tap to open.' }
    : { kind: 'status', title: 'Not available', body: 'The meeting person is not available. Tap to open.' };
}

function broadcastVisit(organizationId: string, visitor: StoredVisitor, notice?: VisitNotice | null) {
  const payload = {
    visitor: toPublicVisitor(visitor),
    meeting: meetingInfo(organizationId, visitor),
    notice: notice || null,
  };
  emitToOrg(organizationId, 'org:visit', payload);
  emitToVisitor(visitor.id, 'visit:updated', payload);
  if (notice) void sendVisitorPush(visitor.id, visitor.publicCode, notice);
}

function visitStartMs(visitor: StoredVisitor) {
  if (visitor.date && visitor.inTime) {
    const stamp = new Date(`${visitor.date}T${visitor.inTime}:00+05:30`).getTime();
    if (!Number.isNaN(stamp)) return stamp;
  }
  return new Date(visitor.createdAt).getTime();
}

function canForceClose(visitor: StoredVisitor) {
  if (visitor.outTime || visitor.ticketStatus === 'closed' || visitor.ticketStatus === 'declined') return false;
  return Date.now() - visitStartMs(visitor) >= 60 * 60 * 1000;
}

function closerFromUser(user?: AuthUser | null) {
  if (!user) return { closedByUserId: null as string | null, closedByName: 'System', closedByRole: 'Auto-close' };
  if (user.role === 'org_admin') {
    return { closedByUserId: user.id, closedByName: user.fullName, closedByRole: 'Organisation Admin' };
  }
  const role = user.staffRoleId ? findRoleById(user.staffRoleId) : undefined;
  return {
    closedByUserId: user.id,
    closedByName: user.fullName,
    closedByRole: role?.name || 'Staff',
  };
}

function autoCloseExpiredVisits(organizationId: string) {
  const cutoff = addIndiaDays(indiaDateTime().date, -3);
  const closed: StoredVisitor[] = [];
  for (const item of listVisitorsByOrg(organizationId)) {
    if (item.outTime || item.ticketStatus === 'closed' || item.ticketStatus === 'declined') continue;
    const date = item.date || indiaDateTime(new Date(item.createdAt)).date;
    if (date > cutoff) continue;
    const updated = updateVisitor(item.id, {
      ticketStatus: 'closed',
      outTime: indiaDateTime().time,
      closedByUserId: null,
      closedByName: 'System',
      closedByRole: '3-day auto-close',
      closeType: 'auto',
      closedAt: now(),
      updatedAt: now(),
    });
    expireVisitorGoogle(organizationId, item.email);
    if (updated) {
      closed.push(updated);
      broadcastVisit(organizationId, updated);
    }
  }
  return closed;
}

function isOpenVisit(item: StoredVisitor) {
  return !item.outTime && item.ticketStatus !== 'closed' && item.ticketStatus !== 'declined';
}

function expireVisitorGoogle(organizationId: string, email?: string | null) {
  expireGoogleVisitorSession(organizationId, email);
}

function assertActiveGoogleSession(organizationId: string, email: string, token: string) {
  const parsed = assertVisitorGoogle(organizationId, email, token);
  if (parsed.iat < getGoogleSessionValidAfter(organizationId, email)) {
    throw new AppError('Google sign-in expired. Continue with Google again.', 401);
  }
  return parsed;
}

function orgFromCode(publicCode: string) {
  const qr = findQrCodeByPublicCode(publicCode);
  if (!qr) throw new AppError('QR code not found', 404);
  const organization = findOrganizationById(qr.organizationId);
  if (!organization || !organization.isActive) throw new AppError('Organisation not found', 404);
  return { qr, organization };
}

export function getPublicEntry(publicCode: string, visitorId: string) {
  const visit = getPublicVisit(publicCode);
  const { qr, organization } = orgFromCode(publicCode);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== qr.organizationId) {
    throw new AppError('Visitor details not found', 404);
  }
  const ready = applyOpenDefaultWait(organization, visitor, true);
  return { ...visit, visitor: toPublicVisitor(ready), meeting: meetingInfo(organization.id, ready) };
}

function meetingInfo(organizationId: string, visitor: StoredVisitor) {
  const name = visitor.personToMeet?.trim() || '';
  const fields = resolveOrgFields(organizationId);
  const labelOf = (key: string, fallback: string) => fields.find((field) => field.key === key)?.label || fallback;
  const show = resolveFieldShow(organizationId);
  const date = visitor.date || indiaDateTime().date;
  const day = getMeetingDay(organizationId, date);
  const personStatus = name ? day.people[normName(name)]?.status ?? null : null;
  const declined = visitor.ticketStatus === 'declined' || personStatus === 'no';
  const confirmed =
    visitor.waitSource !== 'default' && (Boolean(visitor.waitEndsAt) || visitor.ticketStatus === 'confirmed' || personStatus === 'yes');
  const availability: MeetingAvailability = declined ? 'no' : confirmed || personStatus === 'yes' ? 'yes' : null;
  const remainingMs = visitor.waitEndsAt ? Math.max(0, new Date(visitor.waitEndsAt).getTime() - Date.now()) : 0;
  const checkoutReady = Boolean(!visitor.outTime);
  const nextAvailable = availability === 'no' && name ? findNextAvailableDay(organizationId, name, date) : null;
  return {
    personName: name,
    availability,
    label: availability === 'yes' ? 'Yes' : availability === 'no' ? 'Not' : 'Update shortly',
    waitMinutes: visitor.waitMinutes || null,
    waitStartedAt: visitor.waitStartedAt || null,
    waitEndsAt: visitor.waitEndsAt || null,
    waitSource: visitor.waitSource || null,
    remainingMs,
    checkoutReady,
    nextAvailableDate: nextAvailable?.date || null,
    nextAvailableInDays: nextAvailable?.days ?? null,
    remarksEnabled: show.remarks,
    signatureEnabled: show.visitorSignature,
    outPhotoEnabled: show.outPhoto,
    remarksLabel: labelOf('remarks', 'Remarks'),
    signatureLabel: labelOf('visitorSignature', 'Visitor signature'),
    outPhotoLabel: labelOf('outPhoto', 'Out gate photo'),
    ratingEnabled: show.rating,
    ratingLabel: labelOf('rating', 'Meeting rating'),
    remarksRequired: Boolean(fields.find((field) => field.key === 'remarks')?.required && show.remarks),
    signatureRequired: Boolean(fields.find((field) => field.key === 'visitorSignature')?.required && show.visitorSignature),
    outPhotoRequired: Boolean(fields.find((field) => field.key === 'outPhoto')?.required && show.outPhoto),
    checkoutFields: enabledCheckoutFields(organizationId).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      custom: field.custom,
    })),
  };
}

function findNextAvailableDay(organizationId: string, personName: string, fromDate: string) {
  const key = normName(personName);
  if (!key) return null;
  for (let days = 1; days <= 90; days += 1) {
    const date = addIndiaDays(fromDate, days);
    const status = getMeetingDay(organizationId, date).people[key]?.status ?? null;
    if (status === 'yes') return { date, days };
  }
  return null;
}

export function buildMeetingBoard(organizationId: string) {
  const today = indiaDateTime().date;
  const items = listTodayMeetings(organizationId).items.map((item) => {
    const next =
      item.status === 'no' ? findNextAvailableDay(organizationId, item.name, today) : null;
    return {
      name: item.name,
      status: item.status,
      label: item.label,
      nextAvailableDate: next?.date || null,
      nextAvailableInDays: next?.days ?? null,
    };
  });
  return { date: today, items };
}

function ensureWaitRunning(organization: StoredOrganization, visitor: StoredVisitor) {
  if (visitor.waitEndsAt && new Date(visitor.waitEndsAt).getTime() > Date.now()) {
    return (
      updateVisitor(visitor.id, {
        ticketStatus: 'confirmed',
        waitSource: visitor.waitSource === 'default' ? 'manual' : visitor.waitSource || 'manual',
        updatedAt: now(),
      }) || visitor
    );
  }
  const wait = defaultWaitMinutesOf(organization);
  if (!wait) {
    return (
      updateVisitor(visitor.id, {
        ticketStatus: 'confirmed',
        waitSource: 'manual',
        updatedAt: now(),
      }) || visitor
    );
  }
  return updateVisitor(visitor.id, { ...waitFields(wait, 'manual'), updatedAt: now() }) || visitor;
}

function visitsFor(organizationId: string, visitor: StoredVisitor) {
  if (visitor.email) {
    const byEmail = listVisitorsByOrgEmail(organizationId, visitor.email);
    if (byEmail.length) return byEmail;
  }
  if (visitor.visitorUid) return listVisitorsByOrgUid(organizationId, visitor.visitorUid);
  if (visitor.mobileNumber) return listVisitorsByOrgMobile(organizationId, visitor.mobileNumber);
  return [visitor];
}

export function listPublicHistory(publicCode: string, visitorId: string) {
  const visit = getPublicVisit(publicCode);
  const { qr } = orgFromCode(publicCode);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== qr.organizationId) {
    return { ...visit, items: [] as ReturnType<typeof toPublicVisitor>[] };
  }
  return { ...visit, items: visitsFor(visitor.organizationId, visitor).map(toPublicVisitor) };
}

function googleVisitorSession(
  publicCode: string,
  email: string,
  googleToken: string,
  extras: { googleSub?: string | null; name?: string | null } = {}
) {
  const visit = getPublicVisit(publicCode);
  const { organization } = orgFromCode(publicCode);
  const items = listVisitorsByOrgEmail(organization.id, email);
  const open = items.find((item) => isOpenVisit(item)) || null;
  const last = items[0] || null;
  return {
    ...visit,
    email,
    googleToken,
    googleSub: extras.googleSub || last?.googleSub || null,
    visitorUid: last?.visitorUid || null,
    known: Boolean(last),
    visitCount: items.length,
    openVisit: open ? toPublicVisitor(open) : null,
    profile: last
      ? toPublicVisitor(last)
      : extras.name
        ? { visitorName: extras.name, email }
        : null,
  };
}

export async function signInGoogleVisitor(publicCode: string, credential: string) {
  const { organization } = orgFromCode(publicCode);
  const google = await verifyGoogleIdToken(credential);
  return googleVisitorSession(
    publicCode,
    google.email,
    signVisitorGoogle(organization.id, google.email),
    { googleSub: google.googleSub, name: google.name }
  );
}

export function resumeGoogleVisitor(publicCode: string, email: string, googleToken: string) {
  const { organization } = orgFromCode(publicCode);
  const normalized = text(email)?.toLowerCase();
  if (!normalized) throw new AppError('Continue with Google first', 400);
  autoCloseExpiredVisits(organization.id);
  const known = listVisitorsByOrgEmail(organization.id, normalized);
  if (known.length > 0) {
    // Already continued before (in DB) — accept prior device token even if expired, skip Google chooser
    assertVisitorGoogleSignature(organization.id, normalized, googleToken);
    const fresh = signVisitorGoogle(organization.id, normalized);
    const last = known[0];
    return googleVisitorSession(publicCode, normalized, fresh, {
      googleSub: last?.googleSub || null,
      name: last?.visitorName || null,
    });
  }
  assertActiveGoogleSession(organization.id, normalized, googleToken);
  return googleVisitorSession(publicCode, normalized, googleToken);
}

/** Device already used this email + visitor exists in DB → skip Google account chooser entirely. */
export function resumeDbGoogleVisitor(publicCode: string, email: string) {
  const { organization } = orgFromCode(publicCode);
  const normalized = text(email)?.toLowerCase();
  if (!normalized) throw new AppError('Continue with Google first', 400);
  autoCloseExpiredVisits(organization.id);
  const known = listVisitorsByOrgEmail(organization.id, normalized);
  if (!known.length) throw new AppError('Continue with Google first', 401);
  const fresh = signVisitorGoogle(organization.id, normalized);
  const last = known[0];
  return googleVisitorSession(publicCode, normalized, fresh, {
    googleSub: last?.googleSub || null,
    name: last?.visitorName || null,
  });
}

export function startPhoneVisitor(publicCode: string, mobileNumber?: string) {
  const visit = getPublicVisit(publicCode);
  const { organization } = orgFromCode(publicCode);
  const mobile = normalizeMobile(text(mobileNumber) || null);
  if (text(mobileNumber) && (!mobile || !MOBILE.test(mobile))) {
    throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
  }
  const last = mobile ? listVisitorsByOrgMobile(organization.id, mobile)[0] || null : null;
  return {
    ...visit,
    email: last?.email || '',
    googleToken: signVisitorGoogle(organization.id, PHONE_SESSION_SUBJECT),
    auth: 'phone' as const,
    visitorUid: last?.visitorUid || null,
    known: Boolean(last),
    visitCount: last ? listVisitorsByOrgMobile(organization.id, mobile || '').length : 0,
    openVisit: null,
    mobileNumber: mobile || '',
    profile: last
      ? {
          ...toPublicVisitor(last),
          mobileNumber: mobile || last.mobileNumber,
        }
      : mobile
        ? {
            visitorName: null,
            mobileNumber: mobile,
            addressCompany: null,
            email: null,
            personToMeet: null,
            department: null,
            purpose: null,
            vehicleNumber: null,
          }
        : null,
  };
}

type UploadedFiles = Record<string, Express.Multer.File[] | undefined>;

export function registerVisitor(publicCode: string, body: Record<string, unknown>, files: UploadedFiles = {}) {
  const qr = findQrCodeByPublicCode(publicCode);
  if (!qr) throw new AppError('QR code not found', 404);
  const organization = findOrganizationById(qr.organizationId);
  if (!organization || !organization.isActive) throw new AppError('Organisation not found', 404);

  const enabled = enabledEntryFields(organization.id);
  const required = new Set(enabled.filter((field) => field.required).map((field) => field.key));
  const values: Partial<StoredVisitor> = {};

  const assignText = (key: VisitorFieldKey, storeKey: keyof StoredVisitor) => {
    const value = text(body[key]);
    if (required.has(key) && !value) throw new AppError(`${enabled.find((item) => item.key === key)?.label} is required`, 400);
    (values as Record<string, unknown>)[storeKey] = value;
  };

  if (enabled.some((field) => field.key === 'visitorName')) assignText('visitorName', 'visitorName');
  if (enabled.some((field) => field.key === 'mobileNumber')) {
    assignText('mobileNumber', 'mobileNumber');
    values.mobileNumber = normalizeMobile(values.mobileNumber || null);
    if (values.mobileNumber && !MOBILE.test(values.mobileNumber)) {
      throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
    }
  }
  if (enabled.some((field) => field.key === 'addressCompany')) assignText('addressCompany', 'addressCompany');
  if (enabled.some((field) => field.key === 'personToMeet')) assignText('personToMeet', 'personToMeet');
  if (enabled.some((field) => field.key === 'department')) assignText('department', 'department');
  if (enabled.some((field) => field.key === 'purpose')) assignText('purpose', 'purpose');
  if (enabled.some((field) => field.key === 'vehicleNumber')) assignText('vehicleNumber', 'vehicleNumber');
  if (enabled.some((field) => field.key === 'remarks')) assignText('remarks', 'remarks');

  const customValues: Record<string, string> = {};
  for (const field of enabled.filter((item) => item.custom)) {
    if (isCustomFileType(field.type)) {
      const uploaded = files[field.key]?.[0]?.filename || null;
      if (required.has(field.key) && !uploaded) throw new AppError(`${field.label} is required`, 400);
      if (uploaded) customValues[field.key] = uploaded;
      continue;
    }
    const value = text(body[field.key]);
    if (required.has(field.key) && !value) throw new AppError(`${field.label} is required`, 400);
    const typeError = value ? customFieldValueError(field.type, value, field.label) : null;
    if (typeError) throw new AppError(typeError, 400);
    if (value) customValues[field.key] = value;
  }

  const signatureFile = files.signature?.[0]?.filename || null;
  const aadhaarFrontFile = files.aadhaarFront?.[0]?.filename || null;
  const aadhaarBackFile = files.aadhaarBack?.[0]?.filename || null;

  if (required.has('visitorSignature') && !signatureFile) throw new AppError('Visitor signature is required', 400);
  if (required.has('aadhaarFront') && !aadhaarFrontFile) throw new AppError('Aadhaar front photo is required', 400);
  if (required.has('aadhaarBack') && !aadhaarBackFile) throw new AppError('Aadhaar back photo is required', 400);

  const timestamp = now();
  const india = indiaDateTime();
  const phoneAuth = String(body.auth || '').trim() === 'phone';
  const email = text(body.email)?.toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) throw new AppError('Enter a valid email', 400);

  if (phoneAuth) {
    assertVisitorGoogle(organization.id, PHONE_SESSION_SUBJECT, String(body.googleToken || ''));
    values.mobileNumber = normalizeMobile(values.mobileNumber || text(body.mobileNumber));
    if (!values.mobileNumber || !MOBILE.test(values.mobileNumber)) {
      throw new AppError('Enter a valid 10-digit Indian mobile number', 400);
    }
  } else {
    if (!email) throw new AppError('Continue with Google first', 400);
    assertActiveGoogleSession(organization.id, email, String(body.googleToken || ''));
  }

  let visitorUid = text(body.visitorUid);
  const previousEmail = email ? listVisitorsByOrgEmail(organization.id, email)[0] : undefined;
  if (previousEmail?.visitorUid) visitorUid = previousEmail.visitorUid;
  else if (values.mobileNumber) {
    const previous = listVisitorsByOrgMobile(organization.id, values.mobileNumber)[0];
    if (previous?.visitorUid) visitorUid = previous.visitorUid;
  }
  if (!visitorUid) visitorUid = uniqueVisitorUid(organization.id);

  const visitor = addVisitor({
    id: randomUUID(),
    organizationId: organization.id,
    qrCodeId: qr.id,
    publicCode: qr.publicCode,
    label: qr.label,
    date: india.date,
    visitorName: values.visitorName || null,
    email,
    googleSub: previousEmail?.googleSub || text(body.googleSub) || null,
    mobileNumber: values.mobileNumber || null,
    addressCompany: values.addressCompany || null,
    personToMeet: values.personToMeet || null,
    department: values.department || null,
    purpose: values.purpose || null,
    vehicleNumber: values.vehicleNumber || null,
    inTime: india.time,
    outTime: null,
    signatureFile,
    remarks: values.remarks || null,
    aadhaarFrontFile,
    aadhaarBackFile,
    selfieFile: null,
    customValues,
    visitorUid,
    outLabel: null,
    outPublicCode: null,
    outQrCodeId: null,
    ...ticketDefaults(organization),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  broadcastVisit(organization.id, visitor, visitor.waitMinutes ? timerNotice(visitor.waitMinutes, 'default') : null);
  return {
    ...getPublicVisit(publicCode),
    visitor: toPublicVisitor(visitor),
    meeting: meetingInfo(organization.id, visitor),
  };
}

export function saveVisitorSelfie(publicCode: string, visitorId: string, filename: string) {
  const visit = getPublicVisit(publicCode);
  if (!visit.selfieEnabled) throw new AppError('Selfie is turned off for this organisation', 400);
  const { qr, organization } = orgFromCode(publicCode);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== qr.organizationId) {
    throw new AppError('Visitor details not found', 404);
  }
  const updated = updateVisitor(visitor.id, { selfieFile: filename, updatedAt: now() });
  if (!updated) throw new AppError('Visitor details not found', 404);
  // Wait counter starts after the visitor success popup (via getPublicEntry / start wait) — not here
  return {
    ...visit,
    visitor: toPublicVisitor(updated),
    meeting: meetingInfo(organization.id, updated),
  };
}

export function recognizeVisitor(publicCode: string, visitorUid?: string) {
  const visit = getPublicVisit(publicCode);
  const uid = text(visitorUid);
  if (!uid) return { ...visit, known: false, openVisit: null, profile: null };
  const items = listVisitorsByOrgUid(visit.organizationId, uid);
  const open = items.find((item) => !item.outTime) || null;
  const last = items[0] || null;
  return {
    ...visit,
    known: Boolean(last),
    openVisit: open ? toPublicVisitor(open) : null,
    profile: last ? toPublicVisitor(last) : null,
  };
}

export function checkInVisitor(publicCode: string, visitorUid: string) {
  const { qr, organization } = orgFromCode(publicCode);
  const uid = text(visitorUid);
  if (!uid) throw new AppError('Visitor ID is required', 400);
  const items = listVisitorsByOrgUid(organization.id, uid);
  const open = items.find((item) => !item.outTime);
  if (open) {
    const ready = applyOpenDefaultWait(organization, open, true);
    return {
      ...getPublicVisit(publicCode),
      visitor: toPublicVisitor(ready),
      meeting: meetingInfo(organization.id, ready),
      checkout: true,
    };
  }
  const last = items[0];
  if (!last) throw new AppError('Visitor details not found', 404);
  const timestamp = now();
  const india = indiaDateTime();
  const visitor = addVisitor({
    id: randomUUID(),
    organizationId: organization.id,
    qrCodeId: qr.id,
    publicCode: qr.publicCode,
    label: qr.label,
    date: india.date,
    visitorName: last.visitorName,
    email: last.email || null,
    googleSub: last.googleSub || null,
    mobileNumber: last.mobileNumber,
    addressCompany: last.addressCompany,
    personToMeet: last.personToMeet,
    department: last.department,
    purpose: last.purpose,
    vehicleNumber: last.vehicleNumber,
    inTime: india.time,
    outTime: null,
    signatureFile: last.signatureFile,
    remarks: last.remarks,
    aadhaarFrontFile: last.aadhaarFrontFile,
    aadhaarBackFile: last.aadhaarBackFile,
    selfieFile: null,
    customValues: last.customValues || {},
    visitorUid: last.visitorUid || uid,
    outLabel: null,
    outPublicCode: null,
    outQrCodeId: null,
    ...ticketDefaults(organization),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  broadcastVisit(organization.id, visitor, visitor.waitMinutes ? timerNotice(visitor.waitMinutes, 'default') : null);
  return {
    ...getPublicVisit(publicCode),
    visitor: toPublicVisitor(visitor),
    meeting: meetingInfo(organization.id, visitor),
    checkout: false,
  };
}

export function checkOutVisitor(
  publicCode: string,
  visitorId: string,
  outPublicCode?: string,
  extras: {
    remarks?: string;
    signatureFile?: string;
    outPhotoFile?: string;
    requireMeetingFields?: boolean;
    customValues?: Record<string, string>;
  } = {}
) {
  const { qr, organization } = orgFromCode(publicCode);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== organization.id) {
    throw new AppError('Visitor details not found', 404);
  }
  if (visitor.outTime) throw new AppError('Out time is already saved', 400);
  const outCode = text(outPublicCode) || qr.publicCode;
  const outQr = findQrCodeByPublicCode(outCode);
  if (!outQr || outQr.organizationId !== organization.id) {
    throw new AppError('Select a valid gate for out time', 400);
  }
  const checkout = enabledCheckoutFields(organization.id);
  if (extras.requireMeetingFields) {
    const signatureField = checkout.find((field) => field.key === 'visitorSignature');
    const outPhotoField = checkout.find((field) => field.key === 'outPhoto');
    const remarksField = checkout.find((field) => field.key === 'remarks');
    if (signatureField?.required && !extras.signatureFile && !visitor.signatureFile) {
      throw new AppError(`${signatureField.label} is required`, 400);
    }
    if (outPhotoField?.required && !extras.outPhotoFile) throw new AppError(`${outPhotoField.label} is required`, 400);
    if (remarksField?.required && !text(extras.remarks)) throw new AppError(`${remarksField.label} is required`, 400);
  }
  const customValues = { ...(visitor.customValues || {}) };
  for (const field of checkout.filter((item) => item.custom)) {
    const value = extras.customValues?.[field.key] || '';
    if (field.required && !value) throw new AppError(`${field.label} is required`, 400);
    const typeError = value && !isCustomFileType(field.type) ? customFieldValueError(field.type, value, field.label) : null;
    if (typeError) throw new AppError(typeError, 400);
    if (value) customValues[field.key] = value;
  }
  const india = indiaDateTime();
  const personName = visitor.personToMeet?.trim() || '';
  const personStatus = personName
    ? getMeetingDay(organization.id, visitor.date || india.date).people[normName(personName)]?.status ?? null
    : null;
  const markedNot = personStatus === 'no';
  const updated = updateVisitor(visitor.id, {
    outTime: india.time,
    outLabel: outQr.label,
    outPublicCode: outQr.publicCode,
    outQrCodeId: outQr.id,
    remarks: text(extras.remarks) || visitor.remarks,
    signatureFile: extras.signatureFile || visitor.signatureFile,
    outPhotoFile: extras.outPhotoFile || visitor.outPhotoFile || null,
    customValues,
    ticketStatus: markedNot ? 'declined' : 'closed',
    closeType: 'checkout',
    closedByUserId: null,
    closedByName: null,
    closedByRole: null,
    closedAt: now(),
    updatedAt: now(),
  });
  if (!updated) throw new AppError('Visitor details not found', 404);
  expireVisitorGoogle(organization.id, updated.email);
  broadcastVisit(organization.id, updated);
  return {
    ...getPublicVisit(publicCode),
    visitor: toPublicVisitor(updated),
    meeting: meetingInfo(organization.id, updated),
  };
}

export function saveVisitorRating(publicCode: string, visitorId: string, ratingValue: number) {
  const { organization } = orgFromCode(publicCode);
  if (!resolveFieldShow(organization.id).rating) throw new AppError('Rating is turned off', 400);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== organization.id) throw new AppError('Visitor details not found', 404);
  if (!visitor.outTime) throw new AppError('Submit out details first', 400);
  const rating = Math.min(5, Math.max(1, Math.round(Number(ratingValue) || 0)));
  if (!rating) throw new AppError('Choose a rating from 1 to 5', 400);
  const updated = updateVisitor(visitor.id, { rating, updatedAt: now() });
  if (!updated) throw new AppError('Visitor details not found', 404);
  broadcastVisit(organization.id, updated);
  return { visitor: toPublicVisitor(updated), meeting: meetingInfo(organization.id, updated) };
}

export function listTickets(
  organizationId: string | null | undefined,
  status = 'all',
  page = 1,
  limit = 10,
  day = 'today'
) {
  const organization = requireOrg(organizationId);
  autoCloseExpiredVisits(organization.id);
  const today = indiaDateTime().date;
  const selected = day === 'yesterday' ? addIndiaDays(today, -1) : today;
  const all = listVisitorsByOrg(organization.id)
    .filter((item) => (item.date || indiaDateTime(new Date(item.createdAt)).date) === selected)
    .sort(latestVisitFirst)
    .map((item) => applyOpenDefaultWait(organization, item, true));
  const mapped = all.map((item) => ({
    ...toPublicVisitor(item),
    ticketStatus: ticketStatusOf(item),
  }));
  const waiting = mapped.filter((item) => item.ticketStatus === 'waiting').length;
  const confirmed = mapped.filter((item) => item.ticketStatus === 'confirmed').length;
  const closed = mapped.filter((item) => item.ticketStatus === 'closed').length;
  const filtered = status === 'waiting' || status === 'confirmed' || status === 'closed'
    ? mapped.filter((item) => item.ticketStatus === status)
    : mapped;
  const size = Math.min(50, Math.max(1, Number(limit) || 10));
  const current = Math.max(1, Number(page) || 1);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const start = (current - 1) * size;
  return {
    date: selected,
    day: day === 'yesterday' ? 'yesterday' : 'today',
    page: current,
    pages,
    limit: size,
    summary: { waiting, confirmed, closed, total: mapped.length },
    defaultWaitMinutes: defaultWaitMinutesOf(organization),
    items: filtered.slice(start, start + size),
  };
}

export function saveDefaultWaitMinutes(organizationId: string | null | undefined, minutes: number | null) {
  const organization = requireOrg(organizationId);
  const next = minutes == null ? null : Math.min(180, Math.max(1, Number(minutes) || 0));
  if (minutes != null && !next) throw new AppError('Wait time is required', 400);
  updateOrganization({ ...organization, defaultWaitMinutes: next, updatedAt: now() });
  // Only for new visitors when they arrive — does not change open tickets
  return { defaultWaitMinutes: next };
}

/** Mid-session: set countdown on every currently open visitor ticket */
export function applyWaitMinutesToAllOpenVisitors(
  organizationId: string | null | undefined,
  minutes: number | null
) {
  const organization = requireOrg(organizationId);
  const next = minutes == null ? null : Math.min(180, Math.max(1, Number(minutes) || 0));
  if (minutes != null && !next) throw new AppError('Wait time is required', 400);
  let updatedCount = 0;
  for (const visitor of listVisitorsByOrg(organization.id)) {
    if (visitor.outTime || visitor.ticketStatus === 'closed' || visitor.ticketStatus === 'declined') continue;
    if (next) {
      const updated = updateVisitor(visitor.id, {
        ...waitFields(next, 'manual'),
        updatedAt: now(),
      });
      if (updated) {
        updatedCount += 1;
        broadcastVisit(organization.id, updated, timerNotice(next, 'manual'));
      }
      continue;
    }
    const updated = updateVisitor(visitor.id, {
      waitMinutes: null,
      waitStartedAt: null,
      waitEndsAt: null,
      waitSource: null,
      ticketStatus: 'waiting',
      updatedAt: now(),
    });
    if (updated) {
      updatedCount += 1;
      broadcastVisit(organization.id, updated);
    }
  }
  return { appliedMinutes: next, updatedCount };
}

export function updateTicket(
  organizationId: string | null | undefined,
  visitorId: string,
  action: 'wait' | 'yes' | 'no' | 'close',
  minutes?: number,
  actor?: AuthUser | null
) {
  const organization = requireOrg(organizationId);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== organization.id) throw new AppError('Ticket not found', 404);
  if (visitor.outTime || visitor.ticketStatus === 'closed') throw new AppError('This ticket is already closed', 400);
  const name = visitor.personToMeet?.trim() || '';
  if (action === 'close') {
    const closer = closerFromUser(actor);
    const updated = updateVisitor(visitor.id, {
      ticketStatus: 'closed',
      outTime: indiaDateTime().time,
      closeType: 'force',
      closedAt: now(),
      ...closer,
      updatedAt: now(),
    });
    if (!updated) throw new AppError('Ticket not found', 404);
    expireVisitorGoogle(organization.id, visitor.email);
    broadcastVisit(organization.id, updated);
    return { visitor: toPublicVisitor(updated) };
  }
  if (action === 'no') {
    if (name) setMeetingPersonStatus(organization.id, visitor.date || indiaDateTime().date, name, 'no');
    const updated = updateVisitor(visitor.id, {
      ...stoppedWaitFields(),
      updatedAt: now(),
    });
    if (!updated) throw new AppError('Ticket not found', 404);
    broadcastVisit(organization.id, updated, statusNotice(false));
    return { visitor: toPublicVisitor(updated) };
  }
  if (action === 'yes') {
    if (name) setMeetingPersonStatus(organization.id, visitor.date || indiaDateTime().date, name, 'yes');
    const updated = ensureWaitRunning(organization, visitor);
    broadcastVisit(organization.id, updated, statusNotice(true));
    return { visitor: toPublicVisitor(updated) };
  }
  const wait = Math.min(180, Math.max(1, Number(minutes) || 0));
  if (!wait) throw new AppError('Wait time is required', 400);
  const updated = updateVisitor(visitor.id, {
    ...waitFields(wait, 'manual'),
    updatedAt: now(),
  });
  if (name) setMeetingPersonStatus(organization.id, visitor.date || indiaDateTime().date, name, 'yes');
  if (!updated) throw new AppError('Ticket not found', 404);
  broadcastVisit(organization.id, updated, timerNotice(wait, 'manual'));
  return { visitor: toPublicVisitor(updated) };
}

const RANGES = new Set(['today', 'yesterday', 'week', '30', '60', '90', 'all']);

function latestVisitFirst(
  a: { date?: string | null; inTime?: string | null; createdAt?: string | null },
  b: { date?: string | null; inTime?: string | null; createdAt?: string | null }
) {
  const dateA = a.date || '';
  const dateB = b.date || '';
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const timeA = a.inTime || '';
  const timeB = b.inTime || '';
  if (timeA !== timeB) return timeB.localeCompare(timeA);
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

export function listAdminVisitors(
  organizationId: string | null | undefined,
  range = 'today',
  page = 1,
  limit = 10,
  filters: { date?: string; personToMeet?: string; gate?: string } = {}
) {
  const organization = requireOrg(organizationId);
  autoCloseExpiredVisits(organization.id);
  const key = RANGES.has(range) ? range : 'today';
  const today = indiaDateTime().date;
  let from = today;
  let to = today;
  if (key === 'yesterday') {
    from = addIndiaDays(today, -1);
    to = from;
  } else if (key === 'week') {
    from = addIndiaDays(today, -6);
  } else if (key === '30') {
    from = addIndiaDays(today, -29);
  } else if (key === '60') {
    from = addIndiaDays(today, -59);
  } else if (key === '90') {
    from = addIndiaDays(today, -89);
  } else if (key === 'all') {
    from = '0000-01-01';
    to = '9999-12-31';
  }

  const dateFilter = filters.date?.trim() || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    from = dateFilter;
    to = dateFilter;
  }

  const all = listVisitorsByOrg(organization.id);
  const firstId = new Map<string, string>();
  for (const item of [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const uid = (item.email || '').trim().toLowerCase() || item.visitorUid || item.id;
    if (!firstId.has(uid)) firstId.set(uid, item.id);
  }

  const inRange = all.filter((item) => {
    const date = item.date || indiaDateTime(new Date(item.createdAt)).date;
    return date >= from && date <= to;
  });

  const personFilter = filters.personToMeet?.trim() || '';
  const gateFilter = filters.gate?.trim() || '';
  const items = inRange.filter((item) => {
    if (personFilter && normName(item.personToMeet || '') !== normName(personFilter)) return false;
    if (gateFilter && (item.label || '') !== gateFilter) return false;
    return true;
  });

  const mapped = items
    .map((item) => {
      const uid = (item.email || '').trim().toLowerCase() || item.visitorUid || item.id;
      return {
        ...toPublicVisitor(item),
        revisit: firstId.get(uid) !== item.id,
      };
    })
    .sort(latestVisitFirst);

  const people = new Map<string, string>();
  const dates = new Set<string>();
  const gates = new Set<string>();
  for (const item of inRange) {
    const date = item.date || indiaDateTime(new Date(item.createdAt)).date;
    if (date) dates.add(date);
    if (item.label) gates.add(item.label);
    const person = item.personToMeet?.trim();
    if (person) people.set(normName(person), person);
  }

  const size = Math.min(50, Math.max(1, Number(limit) || 10));
  const current = Math.max(1, Number(page) || 1);
  const pages = Math.max(1, Math.ceil(mapped.length / size));
  const start = (current - 1) * size;

  return {
    range: key,
    from,
    to,
    page: current,
    limit: size,
    pages,
    filters: {
      dates: [...dates].sort((a, b) => b.localeCompare(a)),
      people: [...people.values()].sort((a, b) => a.localeCompare(b)),
      gates: [...gates].sort((a, b) => a.localeCompare(b)),
    },
    summary: {
      total: mapped.length,
      revisits: mapped.filter((item) => item.revisit).length,
      inCount: mapped.filter((item) => item.inTime).length,
      outCount: mapped.filter((item) => item.outTime).length,
    },
    items: mapped.slice(start, start + size),
  };
}

export function getAdminVisitorDetail(organizationId: string | null | undefined, visitorId: string) {
  const organization = requireOrg(organizationId);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== organization.id) throw new AppError('Visitor details not found', 404);
  const history = visitsFor(organization.id, visitor).sort(latestVisitFirst);
  const person = visitor.personToMeet?.trim() || '';
  const meetMap = new Map<string, { person: string; count: number }>();
  for (const item of history) {
    const name = item.personToMeet?.trim();
    if (!name) continue;
    const key = normName(name);
    const current = meetMap.get(key);
    if (current) current.count += 1;
    else meetMap.set(key, { person: name, count: 1 });
  }
  const meetCounts = [...meetMap.values()];
  const fields = [
    { key: 'email', label: 'Email', type: 'text' as const },
    ...resolveOrgFields(organization.id)
      .filter((field) => field.key !== 'outTime' && field.showOnWebApp)
      .map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
      })),
  ];
  return {
    visitor: toPublicVisitor(visitor),
    fields,
    visitCount: history.length,
    meetCount: meetCounts.find((item) => normName(item.person) === normName(person))?.count ?? 0,
    meetPerson: person,
    meetCounts,
    history: history.map(toPublicVisitor),
  };
}

export function listTodayMeetings(organizationId: string | null | undefined, date?: string) {
  const organization = requireOrg(organizationId);
  const today = indiaDateTime().date;
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const day = getMeetingDay(organization.id, selected);
  const names = meetingPeopleMap(organization.id, selected);
  return {
    date: selected,
    items: [...names.entries()].map(([key, name]) => {
      const status = day.people[key]?.status ?? null;
      return {
        name: day.people[key]?.name || name,
        status,
        label: status === 'yes' ? 'Yes' : status === 'no' ? 'Not' : 'Update shortly',
      };
    }),
  };
}

function meetingPeopleMap(organizationId: string, _selected?: string) {
  const names = new Map<string, string>();
  for (const name of listMeetingPeople(organizationId)) {
    const key = normName(name);
    if (key) names.set(key, name.trim());
  }
  return names;
}

export function listMeetingsMonth(organizationId: string | null | undefined, month?: string) {
  const organization = requireOrg(organizationId);
  const today = indiaDateTime().date;
  const stamp = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [, monthRaw] = stamp.split('-').map(Number);
  const mon = monthRaw - 1;
  const year = Number(stamp.slice(0, 4));
  const total = new Date(year, mon + 1, 0).getDate();
  const roster = meetingPeopleMap(organization.id);
  const days: Record<string, { name: string; status: MeetingAvailability; label: string }[]> = {};
  for (let day = 1; day <= total; day += 1) {
    const iso = `${stamp}-${String(day).padStart(2, '0')}`;
    const meetingDay = getMeetingDay(organization.id, iso);
    days[iso] = [...roster.entries()].map(([key, name]) => {
      const status = meetingDay.people[key]?.status ?? null;
      return {
        name: meetingDay.people[key]?.name || name,
        status,
        label: status === 'yes' ? 'Yes' : status === 'no' ? 'Not' : 'Update shortly',
      };
    });
  }
  return { month: stamp, days };
}

export function addMeetingPersonName(organizationId: string | null | undefined, name: string) {
  const organization = requireOrg(organizationId);
  if (!name.trim()) throw new AppError('Person name is required', 400);
  try {
    addMeetingPerson(organization.id, name);
  } catch {
    throw new AppError('Person name is required', 400);
  }
  const today = indiaDateTime().date;
  setMeetingPersonStatus(organization.id, today, name, null);
  return listTodayMeetings(organization.id);
}

export function removeMeetingPersonName(organizationId: string | null | undefined, name: string) {
  const organization = requireOrg(organizationId);
  if (!name.trim()) throw new AppError('Person name is required', 400);
  try {
    removeMeetingPerson(organization.id, name);
  } catch {
    throw new AppError('Person name is required', 400);
  }
  return listTodayMeetings(organization.id);
}

export function saveMeetingStatus(
  organizationId: string | null | undefined,
  name: string,
  status: MeetingAvailability,
  date?: string
) {
  const organization = requireOrg(organizationId);
  if (status !== 'yes' && status !== 'no' && status !== null) throw new AppError('Invalid availability', 400);
  if (!name.trim()) throw new AppError('Person name is required', 400);
  try {
    addMeetingPerson(organization.id, name);
  } catch {
    throw new AppError('Person name is required', 400);
  }
  const today = indiaDateTime().date;
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  setMeetingPersonStatus(organization.id, selected, name, status);
  if (selected === today) {
    const key = normName(name);
    for (const visitor of listVisitorsByOrg(organization.id)) {
      const visitDate = visitor.date || indiaDateTime(new Date(visitor.createdAt)).date;
      if (visitDate !== today || visitor.outTime || visitor.ticketStatus === 'closed' || visitor.ticketStatus === 'declined') continue;
      if (normName(visitor.personToMeet || '') !== key) continue;
      if (status === 'no') {
        const updated = updateVisitor(visitor.id, {
          ...stoppedWaitFields(),
          updatedAt: now(),
        });
        if (updated) broadcastVisit(organization.id, updated, statusNotice(false));
        continue;
      }
      if (status === 'yes') {
        const updated = ensureWaitRunning(organization, visitor);
        broadcastVisit(organization.id, updated, statusNotice(true));
        continue;
      }
      const cleared = updateVisitor(visitor.id, {
        waitMinutes: null,
        waitStartedAt: null,
        waitEndsAt: null,
        waitSource: null,
        ticketStatus: 'waiting',
        updatedAt: now(),
      });
      const ready = cleared ? applyOpenDefaultWait(organization, cleared) : visitor;
      broadcastVisit(organization.id, ready, {
        kind: 'status',
        title: 'Update shortly',
        body: 'Availability will update shortly. Tap to open.',
      });
    }
  }
  return listTodayMeetings(organization.id, selected);
}

export function saveVisitorPush(
  publicCode: string,
  visitorId: string,
  body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
) {
  const { qr, organization } = orgFromCode(publicCode);
  const visitor = findVisitorById(visitorId);
  if (!visitor || visitor.organizationId !== organization.id) throw new AppError('Visitor details not found', 404);
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) throw new AppError('Push subscription is required', 400);
  return savePushSubscription({
    visitorId: visitor.id,
    organizationId: organization.id,
    publicCode: qr.publicCode,
    endpoint: String(body.endpoint),
    keys: { p256dh: String(body.keys.p256dh), auth: String(body.keys.auth) },
    updatedAt: now(),
  });
}

export function getOrgVisitorDashboard(organizationId: string | null | undefined) {
  const organization = requireOrg(organizationId);
  const today = indiaDateTime().date;
  const todayVisitors = listVisitorsByOrg(organization.id)
    .filter((item) => (item.date || indiaDateTime(new Date(item.createdAt)).date) === today)
    .slice(0, 20)
    .map(toPublicVisitor);
  return {
    date: today,
    meetings: listTodayMeetings(organization.id),
    visitors: todayVisitors,
  };
}
