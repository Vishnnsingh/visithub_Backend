import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  StaffSummary,
  StoredOrganization,
  StoredQrCode,
  StoredStaffRole,
  StoredUser,
  StoredVisitor,
  StoreIndexes,
  VisitorFieldSettings,
  StoredMeetingDay,
  StoredMeetingPerson,
  StoredPushSubscription,
  HomeLayout,
} from '../types/auth';

export type AppData = {
  users: StoredUser[];
  organizations: StoredOrganization[];
  staffRoles: StoredStaffRole[];
  staffSummaries: Record<string, StaffSummary>;
  qrCodes: StoredQrCode[];
  visitors: StoredVisitor[];
  visitorFieldSettings: Record<string, VisitorFieldSettings>;
  homeLayouts: Record<string, HomeLayout>;
  meetingDays: Record<string, StoredMeetingDay>;
  meetingPeople: Record<string, string[]>;
  googleSessionValidAfter: Record<string, number>;
  pushSubscriptions: Record<string, StoredPushSubscription>;
  indexes: StoreIndexes;
  indexesVersion: number;
};

const INDEXES_VERSION = 7;
const STORE_PATH = path.join(process.cwd(), 'data', 'app-store.json');

export function emptyIndexes(): StoreIndexes {
  return {
    userByEmail: {},
    userById: {},
    staffByOrgPhone: {},
    staffByOrgName: {},
    staffByOrgCode: {},
    roleByOrgCode: {},
    roleByOrgName: {},
    staffIdsByOrg: {},
    staffIdsByOrgRole: {},
    roleIdsByOrg: {},
    visitorById: {},
    visitorIdsByOrg: {},
    visitorIdsByQr: {},
    visitorIdsByOrgMobile: {},
    visitorIdsByOrgUid: {},
    visitorIdsByOrgEmail: {},
  };
}

function emptyData(): AppData {
  return {
    users: [],
    organizations: [],
    staffRoles: [],
    staffSummaries: {},
    qrCodes: [],
    visitors: [],
    visitorFieldSettings: {},
    homeLayouts: {},
    meetingDays: {},
    meetingPeople: {},
    googleSessionValidAfter: {},
    pushSubscriptions: {},
    indexes: emptyIndexes(),
    indexesVersion: INDEXES_VERSION,
  };
}

function ensureStore(): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(emptyData(), null, 2));
  }
}

export function normName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function orgPhoneKey(organizationId: string, phone: string): string {
  return `${organizationId}:${phone.trim()}`;
}

export function orgNameKey(organizationId: string, name: string): string {
  return `${organizationId}:${normName(name)}`;
}

export function orgRoleCodeKey(organizationId: string, code: string): string {
  return `${organizationId}:${code.toUpperCase()}`;
}

export function orgRoleNameKey(organizationId: string, name: string): string {
  return `${organizationId}:${normName(name)}`;
}

export function orgStaffCodeKey(organizationId: string, code: string): string {
  return `${organizationId}:${code.toUpperCase()}`;
}

export function orgRoleStaffKey(organizationId: string, roleId: string): string {
  return `${organizationId}:${roleId}`;
}

function pushUnique(map: Record<string, string[]>, key: string, id: string, newestFirst = true): void {
  const current = map[key] ? map[key].filter((item) => item !== id) : [];
  map[key] = newestFirst ? [id, ...current] : [...current, id];
}

function removeFromList(map: Record<string, string[]>, key: string, id: string): void {
  if (!map[key]) return;
  map[key] = map[key].filter((item) => item !== id);
  if (map[key].length === 0) delete map[key];
}

function unindexUser(data: AppData, user: StoredUser): void {
  if (data.indexes.userByEmail[user.email.toLowerCase()] === user.id) {
    delete data.indexes.userByEmail[user.email.toLowerCase()];
  }
  if (data.indexes.userById[user.id] === user.id) {
    delete data.indexes.userById[user.id];
  }
  if (user.organizationId && user.phone) {
    const phoneKey = orgPhoneKey(user.organizationId, user.phone);
    if (data.indexes.staffByOrgPhone[phoneKey] === user.id) {
      delete data.indexes.staffByOrgPhone[phoneKey];
    }
  }
  if (user.role === 'staff' && user.organizationId) {
    const nameKey = orgNameKey(user.organizationId, user.fullName);
    if (data.indexes.staffByOrgName[nameKey] === user.id) {
      delete data.indexes.staffByOrgName[nameKey];
    }
    removeFromList(data.indexes.staffIdsByOrg, user.organizationId, user.id);
    if (user.staffRoleId) {
      removeFromList(data.indexes.staffIdsByOrgRole, orgRoleStaffKey(user.organizationId, user.staffRoleId), user.id);
    }
    if (user.staffCode) {
      const codeKey = orgStaffCodeKey(user.organizationId, user.staffCode);
      if (data.indexes.staffByOrgCode[codeKey] === user.id) {
        delete data.indexes.staffByOrgCode[codeKey];
      }
    }
  }
}

function indexUser(data: AppData, user: StoredUser): void {
  data.indexes.userByEmail[user.email.toLowerCase()] = user.id;
  data.indexes.userById[user.id] = user.id;
  if (user.organizationId && user.phone) {
    data.indexes.staffByOrgPhone[orgPhoneKey(user.organizationId, user.phone)] = user.id;
  }
  if (user.role === 'staff' && user.organizationId) {
    data.indexes.staffByOrgName[orgNameKey(user.organizationId, user.fullName)] = user.id;
    pushUnique(data.indexes.staffIdsByOrg, user.organizationId, user.id);
    if (user.staffRoleId) {
      pushUnique(
        data.indexes.staffIdsByOrgRole,
        orgRoleStaffKey(user.organizationId, user.staffRoleId),
        user.id
      );
    }
    if (user.staffCode) {
      data.indexes.staffByOrgCode[orgStaffCodeKey(user.organizationId, user.staffCode)] = user.id;
    }
  }
}

function unindexRole(data: AppData, role: StoredStaffRole): void {
  const codeKey = orgRoleCodeKey(role.organizationId, role.code);
  if (data.indexes.roleByOrgCode[codeKey] === role.id) {
    delete data.indexes.roleByOrgCode[codeKey];
  }
  const nameKey = orgRoleNameKey(role.organizationId, role.name);
  if (data.indexes.roleByOrgName[nameKey] === role.id) {
    delete data.indexes.roleByOrgName[nameKey];
  }
  removeFromList(data.indexes.roleIdsByOrg, role.organizationId, role.id);
}

function indexRole(data: AppData, role: StoredStaffRole): void {
  data.indexes.roleByOrgCode[orgRoleCodeKey(role.organizationId, role.code)] = role.id;
  data.indexes.roleByOrgName[orgRoleNameKey(role.organizationId, role.name)] = role.id;
  pushUnique(data.indexes.roleIdsByOrg, role.organizationId, role.id);
}

export function orgVisitorMobileKey(organizationId: string, mobile: string): string {
  return `${organizationId}:${mobile.trim()}`;
}

export function orgVisitorUidKey(organizationId: string, uid: string): string {
  return `${organizationId}:${uid.trim()}`;
}

export function orgVisitorEmailKey(organizationId: string, email: string): string {
  return `${organizationId}:${email.trim().toLowerCase()}`;
}

function indexVisitor(data: AppData, visitor: StoredVisitor): void {
  data.indexes.visitorById[visitor.id] = visitor.id;
  pushUnique(data.indexes.visitorIdsByOrg, visitor.organizationId, visitor.id, false);
  pushUnique(data.indexes.visitorIdsByQr, visitor.publicCode, visitor.id, false);
  if (visitor.mobileNumber) {
    pushUnique(
      data.indexes.visitorIdsByOrgMobile,
      orgVisitorMobileKey(visitor.organizationId, visitor.mobileNumber),
      visitor.id,
      false
    );
  }
  if (visitor.visitorUid) {
    pushUnique(
      data.indexes.visitorIdsByOrgUid,
      orgVisitorUidKey(visitor.organizationId, visitor.visitorUid),
      visitor.id,
      false
    );
  }
  if (visitor.email) {
    pushUnique(
      data.indexes.visitorIdsByOrgEmail,
      orgVisitorEmailKey(visitor.organizationId, visitor.email),
      visitor.id,
      false
    );
  }
}

export function uniqueStaffCode(data: AppData, organizationId: string): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateMixedCode(8);
    if (!data.indexes.staffByOrgCode[orgStaffCodeKey(organizationId, code)]) {
      return code;
    }
  }
  return generateMixedCode(8);
}

export function rebuildIndexes(data: AppData): void {
  data.indexes = emptyIndexes();
  for (const user of data.users) {
    if (user.role === 'staff' && user.organizationId && !user.staffCode) {
      user.staffCode = uniqueStaffCode(data, user.organizationId);
    }
    indexUser(data, user);
  }
  for (const role of data.staffRoles) indexRole(data, role);
  data.indexesVersion = INDEXES_VERSION;

  const summaries: Record<string, StaffSummary> = {};
  const timestamp = new Date().toISOString();
  for (const org of data.organizations) {
    summaries[org.id] = {
      organizationId: org.id,
      totalStaff: 0,
      totalRoles: 0,
      totalActive: 0,
      updatedAt: timestamp,
    };
    if (org.defaultWaitMinutes === undefined) org.defaultWaitMinutes = 10;
  }
  for (const role of data.staffRoles) {
    if (!summaries[role.organizationId]) {
      summaries[role.organizationId] = {
        organizationId: role.organizationId,
        totalStaff: 0,
        totalRoles: 0,
        totalActive: 0,
        updatedAt: timestamp,
      };
    }
    summaries[role.organizationId].totalRoles += 1;
  }
  for (const user of data.users) {
    if (user.role !== 'staff' || !user.organizationId) continue;
    if (!summaries[user.organizationId]) {
      summaries[user.organizationId] = {
        organizationId: user.organizationId,
        totalStaff: 0,
        totalRoles: 0,
        totalActive: 0,
        updatedAt: timestamp,
      };
    }
    summaries[user.organizationId].totalStaff += 1;
    if (user.isActive) summaries[user.organizationId].totalActive += 1;
  }
  data.staffSummaries = summaries;
  for (const visitor of data.visitors || []) {
    if (!visitor.visitorUid) visitor.visitorUid = visitor.id;
    if (visitor.outLabel === undefined) visitor.outLabel = null;
    if (visitor.outPublicCode === undefined) visitor.outPublicCode = null;
    if (visitor.outQrCodeId === undefined) visitor.outQrCodeId = null;
    if (visitor.outPhotoFile === undefined) visitor.outPhotoFile = null;
    if (visitor.waitMinutes === undefined) visitor.waitMinutes = null;
    if (visitor.waitStartedAt === undefined) visitor.waitStartedAt = null;
    if (visitor.waitEndsAt === undefined) visitor.waitEndsAt = null;
    if (visitor.waitSource === undefined) {
      visitor.waitSource =
        visitor.waitEndsAt && visitor.ticketStatus === 'confirmed' ? 'manual' : visitor.waitEndsAt ? 'default' : null;
    }
    if (!visitor.ticketStatus) visitor.ticketStatus = visitor.outTime ? 'closed' : 'waiting';
    if (visitor.closedByUserId === undefined) visitor.closedByUserId = null;
    if (visitor.closedByName === undefined) visitor.closedByName = null;
    if (visitor.closedByRole === undefined) visitor.closedByRole = null;
    if (visitor.closeType === undefined) visitor.closeType = visitor.outTime ? 'checkout' : null;
    if (visitor.rating === undefined) visitor.rating = null;
    if (visitor.closedAt === undefined) {
      visitor.closedAt =
        visitor.outTime || visitor.ticketStatus === 'closed' || visitor.ticketStatus === 'declined'
          ? visitor.updatedAt
          : null;
    }
    if (visitor.email === undefined) visitor.email = null;
    if (visitor.googleSub === undefined) visitor.googleSub = null;
    indexVisitor(data, visitor);
  }
}

function emptySummary(organizationId: string, updatedAt: string): StaffSummary {
  return {
    organizationId,
    totalStaff: 0,
    totalRoles: 0,
    totalActive: 0,
    updatedAt,
  };
}

export function ensureSummary(data: AppData, organizationId: string, updatedAt: string): StaffSummary {
  if (!data.staffSummaries[organizationId]) {
    data.staffSummaries[organizationId] = emptySummary(organizationId, updatedAt);
  }
  return data.staffSummaries[organizationId];
}

export function bumpSummary(
  data: AppData,
  organizationId: string,
  patch: Partial<Pick<StaffSummary, 'totalStaff' | 'totalRoles' | 'totalActive'>>,
  updatedAt: string
): StaffSummary {
  const current = ensureSummary(data, organizationId, updatedAt);
  current.totalStaff = Math.max(0, current.totalStaff + (patch.totalStaff || 0));
  current.totalRoles = Math.max(0, current.totalRoles + (patch.totalRoles || 0));
  current.totalActive = Math.max(0, current.totalActive + (patch.totalActive || 0));
  current.updatedAt = updatedAt;
  return current;
}

export function readStore(): AppData {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const data: AppData = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
      staffRoles: Array.isArray(parsed.staffRoles) ? parsed.staffRoles : [],
      staffSummaries: parsed.staffSummaries && typeof parsed.staffSummaries === 'object' ? parsed.staffSummaries : {},
      qrCodes: Array.isArray(parsed.qrCodes) ? parsed.qrCodes : [],
      visitors: Array.isArray(parsed.visitors) ? parsed.visitors : [],
      visitorFieldSettings:
        parsed.visitorFieldSettings && typeof parsed.visitorFieldSettings === 'object'
          ? parsed.visitorFieldSettings
          : {},
      homeLayouts: parsed.homeLayouts && typeof parsed.homeLayouts === 'object' ? parsed.homeLayouts : {},
      meetingDays: parsed.meetingDays && typeof parsed.meetingDays === 'object' ? parsed.meetingDays : {},
      meetingPeople: parsed.meetingPeople && typeof parsed.meetingPeople === 'object' ? parsed.meetingPeople : {},
      googleSessionValidAfter:
        parsed.googleSessionValidAfter && typeof parsed.googleSessionValidAfter === 'object'
          ? parsed.googleSessionValidAfter
          : {},
      pushSubscriptions:
        parsed.pushSubscriptions && typeof parsed.pushSubscriptions === 'object' ? parsed.pushSubscriptions : {},
      indexes: emptyIndexes(),
      indexesVersion: parsed.indexesVersion || 0,
    };

    const hasIndexes = parsed.indexes && typeof parsed.indexes === 'object' && parsed.indexes.userByEmail;
    if (hasIndexes && data.indexesVersion === INDEXES_VERSION) {
      data.indexes = { ...emptyIndexes(), ...parsed.indexes };
    } else {
      rebuildIndexes(data);
      writeStore(data);
    }
    return data;
  } catch {
    return emptyData();
  }
}

export function writeStore(data: AppData): void {
  ensureStore();
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, STORE_PATH);
}

export function mutateStore<T>(fn: (data: AppData) => T): T {
  const data = readStore();
  const result = fn(data);
  writeStore(data);
  return result;
}

export function findUserByEmail(email: string): StoredUser | undefined {
  const data = readStore();
  const id = data.indexes.userByEmail[email.toLowerCase()];
  if (id) return data.users.find((user) => user.id === id);
  return data.users.find((user) => user.email === email.toLowerCase());
}

export function findUserById(id: string): StoredUser | undefined {
  const data = readStore();
  return data.users.find((user) => user.id === id);
}

export function findOrganizationById(id: string): StoredOrganization | undefined {
  return readStore().organizations.find((org) => org.id === id);
}

export function upsertUser(user: StoredUser): StoredUser {
  return mutateStore((data) => {
    const index = data.users.findIndex((item) => item.id === user.id || item.email === user.email);
    const previous = index >= 0 ? data.users[index] : undefined;
    if (previous) unindexUser(data, previous);
    if (index >= 0) data.users[index] = user;
    else data.users.push(user);
    indexUser(data, user);
    return user;
  });
}

export function addOrganization(organization: StoredOrganization): StoredOrganization {
  return mutateStore((data) => {
    data.organizations.push(organization);
    ensureSummary(data, organization.id, organization.createdAt);
    return organization;
  });
}

export function updateOrganization(organization: StoredOrganization): StoredOrganization {
  return mutateStore((data) => {
    const index = data.organizations.findIndex((item) => item.id === organization.id);
    if (index >= 0) data.organizations[index] = organization;
    else data.organizations.push(organization);
    return organization;
  });
}

export function deleteOrganization(organizationId: string): boolean {
  return mutateStore((data) => {
    const before = data.organizations.length;
    data.organizations = data.organizations.filter((item) => item.id !== organizationId);
    // Deactivate linked users so they cannot log in
    const stamp = new Date().toISOString();
    data.users = data.users.map((user) => {
      if (user.organizationId === organizationId) {
        unindexUser(data, user);
        const next = { ...user, isActive: false, organizationId: null, updatedAt: stamp };
        indexUser(data, next);
        return next;
      }
      return user;
    });
    delete data.staffSummaries[organizationId];
    delete data.indexes.roleIdsByOrg[organizationId];
    delete data.indexes.visitorIdsByOrg[organizationId];
    return data.organizations.length < before;
  });
}

export function listOrganizations(): StoredOrganization[] {
  return readStore().organizations.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listUsers(): StoredUser[] {
  return readStore().users;
}

export function findRoleById(id: string): StoredStaffRole | undefined {
  return readStore().staffRoles.find((role) => role.id === id);
}

export function addStaffRole(role: StoredStaffRole): StoredStaffRole {
  return mutateStore((data) => {
    data.staffRoles.push(role);
    indexRole(data, role);
    bumpSummary(data, role.organizationId, { totalRoles: 1 }, role.createdAt);
    return role;
  });
}

export function removeStaffRole(role: StoredStaffRole, updatedAt: string): void {
  mutateStore((data) => {
    data.staffRoles = data.staffRoles.filter((item) => item.id !== role.id);
    unindexRole(data, role);
    bumpSummary(data, role.organizationId, { totalRoles: -1 }, updatedAt);
  });
}

export function addStaffUser(user: StoredUser): StoredUser {
  return mutateStore((data) => {
    data.users.push(user);
    indexUser(data, user);
    bumpSummary(
      data,
      user.organizationId as string,
      { totalStaff: 1, totalActive: user.isActive ? 1 : 0 },
      user.createdAt
    );
    return user;
  });
}

export function updateStaffUser(previous: StoredUser, next: StoredUser): StoredUser {
  return mutateStore((data) => {
    const index = data.users.findIndex((item) => item.id === previous.id);
    if (index < 0) return next;
    unindexUser(data, previous);
    data.users[index] = next;
    indexUser(data, next);
    if (previous.isActive !== next.isActive && next.organizationId) {
      bumpSummary(data, next.organizationId, { totalActive: next.isActive ? 1 : -1 }, next.updatedAt);
    }
    return next;
  });
}

export function removeStaffUser(user: StoredUser, updatedAt: string): void {
  mutateStore((data) => {
    data.users = data.users.filter((item) => item.id !== user.id);
    unindexUser(data, user);
    if (user.organizationId) {
      bumpSummary(
        data,
        user.organizationId,
        { totalStaff: -1, totalActive: user.isActive ? -1 : 0 },
        updatedAt
      );
    }
  });
}

export function generateMixedCode(length = 8): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const all = letters + numbers;
  const bytes = randomBytes(length);
  const chars = Array.from({ length }, (_, index) => all[bytes[index] % all.length]);
  chars[0] = letters[bytes[0] % letters.length];
  chars[1] = numbers[bytes[1] % numbers.length];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i] % (i + 1);
    const swap = chars[i];
    chars[i] = chars[j];
    chars[j] = swap;
  }
  return chars.join('');
}

export function uniqueQrPublicCode(data: AppData): string {
  const used = new Set(data.qrCodes.map((item) => item.publicCode));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = generateMixedCode(8);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  return generateMixedCode(10);
}

export function listQrCodesByOrg(organizationId: string): StoredQrCode[] {
  return readStore()
    .qrCodes.filter((item) => item.organizationId === organizationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function findQrCodeById(id: string): StoredQrCode | undefined {
  return readStore().qrCodes.find((item) => item.id === id);
}

export function findQrCodeByPublicCode(publicCode: string): StoredQrCode | undefined {
  const code = publicCode.trim().toUpperCase();
  return readStore().qrCodes.find((item) => item.publicCode === code);
}

export function addQrCodes(codes: StoredQrCode[]): StoredQrCode[] {
  return mutateStore((data) => {
    data.qrCodes.push(...codes);
    return codes;
  });
}

export function removeQrCode(id: string, organizationId: string): StoredQrCode | undefined {
  return mutateStore((data) => {
    const index = data.qrCodes.findIndex((item) => item.id === id && item.organizationId === organizationId);
    if (index < 0) return undefined;
    const [removed] = data.qrCodes.splice(index, 1);
    return removed;
  });
}

export function getVisitorFieldSettings(organizationId: string): unknown {
  return readStore().visitorFieldSettings[organizationId] || {};
}

export function saveVisitorFieldSettings(organizationId: string, settings: VisitorFieldSettings): VisitorFieldSettings {
  return mutateStore((data) => {
    data.visitorFieldSettings[organizationId] = settings;
    return settings;
  });
}

export function getHomeLayout(organizationId: string): HomeLayout | null {
  return readStore().homeLayouts[organizationId] || null;
}

export function saveHomeLayout(organizationId: string, layout: HomeLayout): HomeLayout {
  return mutateStore((data) => {
    data.homeLayouts[organizationId] = layout;
    return layout;
  });
}

export function findVisitorById(id: string): StoredVisitor | undefined {
  const data = readStore();
  const indexed = data.indexes.visitorById[id];
  if (indexed) return data.visitors.find((item) => item.id === indexed);
  return data.visitors.find((item) => item.id === id);
}

export function addVisitor(visitor: StoredVisitor): StoredVisitor {
  return mutateStore((data) => {
    data.visitors.push(visitor);
    indexVisitor(data, visitor);
    return visitor;
  });
}

export function updateVisitor(id: string, patch: Partial<StoredVisitor>): StoredVisitor | undefined {
  return mutateStore((data) => {
    const visitor = data.visitors.find((item) => item.id === id);
    if (!visitor) return undefined;
    Object.assign(visitor, patch);
    return visitor;
  });
}

export function listVisitorsByOrgMobile(organizationId: string, mobile: string): StoredVisitor[] {
  const data = readStore();
  const ids = data.indexes.visitorIdsByOrgMobile[orgVisitorMobileKey(organizationId, mobile)] || [];
  return ids
    .map((id) => data.visitors.find((item) => item.id === id))
    .filter((item): item is StoredVisitor => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listVisitorsByOrgUid(organizationId: string, uid: string): StoredVisitor[] {
  const data = readStore();
  const ids = data.indexes.visitorIdsByOrgUid[orgVisitorUidKey(organizationId, uid)] || [];
  return ids
    .map((id) => data.visitors.find((item) => item.id === id))
    .filter((item): item is StoredVisitor => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listVisitorsByOrgEmail(organizationId: string, email: string): StoredVisitor[] {
  const data = readStore();
  const ids = data.indexes.visitorIdsByOrgEmail[orgVisitorEmailKey(organizationId, email)] || [];
  return ids
    .map((id) => data.visitors.find((item) => item.id === id))
    .filter((item): item is StoredVisitor => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listVisitorsByOrg(organizationId: string): StoredVisitor[] {
  const data = readStore();
  const ids = data.indexes.visitorIdsByOrg[organizationId] || [];
  const items = ids
    .map((id) => data.visitors.find((item) => item.id === id))
    .filter((item): item is StoredVisitor => Boolean(item));
  if (items.length) return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return data.visitors
    .filter((item) => item.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function uniqueVisitorUid(organizationId: string): string {
  const data = readStore();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const uid = `V${generateMixedCode(8)}`;
    if (!data.indexes.visitorIdsByOrgUid[orgVisitorUidKey(organizationId, uid)]?.length) return uid;
  }
  return `V${generateMixedCode(10)}`;
}

export function googleSessionKey(organizationId: string, email: string) {
  return orgVisitorEmailKey(organizationId, email);
}

export function getGoogleSessionValidAfter(organizationId: string, email: string) {
  return readStore().googleSessionValidAfter?.[googleSessionKey(organizationId, email)] || 0;
}

export function expireGoogleVisitorSession(organizationId: string, email?: string | null) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 0;
  return mutateStore((data) => {
    if (!data.googleSessionValidAfter) data.googleSessionValidAfter = {};
    const at = Date.now();
    data.googleSessionValidAfter[googleSessionKey(organizationId, normalized)] = at;
    return at;
  });
}

export function listMeetingPeople(organizationId: string): string[] {
  const names = readStore().meetingPeople?.[organizationId] || [];
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function addMeetingPerson(organizationId: string, name: string): string[] {
  const label = name.trim();
  const keyName = normName(label);
  if (!keyName) throw new Error('Person name is required');
  return mutateStore((data) => {
    if (!data.meetingPeople) data.meetingPeople = {};
    const current = data.meetingPeople[organizationId] || [];
    const exists = current.some((item) => normName(item) === keyName);
    if (!exists) data.meetingPeople[organizationId] = [...current, label];
    return listMeetingPeopleFrom(data, organizationId);
  });
}

export function removeMeetingPerson(organizationId: string, name: string): string[] {
  const keyName = normName(name);
  if (!keyName) throw new Error('Person name is required');
  return mutateStore((data) => {
    if (!data.meetingPeople) data.meetingPeople = {};
    data.meetingPeople[organizationId] = (data.meetingPeople[organizationId] || []).filter(
      (item) => normName(item) !== keyName
    );
    return listMeetingPeopleFrom(data, organizationId);
  });
}

function listMeetingPeopleFrom(data: AppData, organizationId: string) {
  return [...(data.meetingPeople?.[organizationId] || [])].sort((a, b) => a.localeCompare(b));
}

export function meetingDayKey(organizationId: string, date: string) {
  return `${organizationId}:${date}`;
}

export function getMeetingDay(organizationId: string, date: string): StoredMeetingDay {
  const key = meetingDayKey(organizationId, date);
  return (
    readStore().meetingDays?.[key] || {
      organizationId,
      date,
      people: {},
    }
  );
}

export function setMeetingPersonStatus(
  organizationId: string,
  date: string,
  name: string,
  status: StoredMeetingPerson['status']
): StoredMeetingDay {
  const label = name.trim();
  const keyName = normName(label);
  if (!keyName) throw new Error('Person name is required');
  return mutateStore((data) => {
    if (!data.meetingDays) data.meetingDays = {};
    const key = meetingDayKey(organizationId, date);
    const current = data.meetingDays[key] || { organizationId, date, people: {} };
    current.people[keyName] = { name: current.people[keyName]?.name || label, status };
    data.meetingDays[key] = current;
    return current;
  });
}

export function savePushSubscription(sub: StoredPushSubscription): StoredPushSubscription {
  return mutateStore((data) => {
    if (!data.pushSubscriptions) data.pushSubscriptions = {};
    for (const [id, current] of Object.entries(data.pushSubscriptions)) {
      if (current.endpoint === sub.endpoint && id !== sub.visitorId) delete data.pushSubscriptions[id];
    }
    data.pushSubscriptions[sub.visitorId] = sub;
    return sub;
  });
}

export function getPushSubscription(visitorId: string): StoredPushSubscription | undefined {
  return readStore().pushSubscriptions?.[visitorId];
}

export function deletePushSubscription(visitorId: string) {
  mutateStore((data) => {
    if (!data.pushSubscriptions) data.pushSubscriptions = {};
    delete data.pushSubscriptions[visitorId];
  });
}
