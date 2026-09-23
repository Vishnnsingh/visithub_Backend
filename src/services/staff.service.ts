import { randomUUID } from 'crypto';
import AppError from '../utils/AppError';
import { now } from '../utils/helpers';
import { hashPassword } from '../utils/password';
import {
  addStaffRole,
  addStaffUser,
  findRoleById,
  findUserByEmail,
  findUserById,
  generateMixedCode,
  orgNameKey,
  orgPhoneKey,
  orgRoleCodeKey,
  orgRoleNameKey,
  orgRoleStaffKey,
  readStore,
  removeStaffRole,
  removeStaffUser,
  uniqueStaffCode,
  updateStaffUser,
  upsertUser,
} from '../data/appStore';
import type { StoredStaffRole, StoredUser } from '../types/auth';
import { normalizeStaffPages } from '../utils/dashboardAccess';
import { ensureSupabaseAuthUser } from './supabaseAuth';

const PAGE_SIZE = 10;
const RESERVED_ROLE = /^(admin|administrator|super[\s_-]?admin|org[\s_-]?admin|organisation[\s_-]?admin|organization[\s_-]?admin)$/i;

export type CreateRoleInput = {
  name: string;
};

export type CreateStaffInput = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  roleId: string;
  allowedPages: string[];
};

export type UpdateStaffInput = {
  fullName: string;
  email: string;
  phone: string;
  roleId: string;
  password?: string;
  allowedPages: string[];
};

function assertOrgAdmin(organizationId: string | null | undefined): string {
  if (!organizationId) {
    throw new AppError('Organisation context is required', 403);
  }
  return organizationId;
}

function assertRoleName(name: string): string {
  const trimmed = name.trim();
  if (RESERVED_ROLE.test(trimmed)) {
    throw new AppError('Admin role cannot be created', 400);
  }
  return trimmed;
}

function uniqueRoleCode(organizationId: string): string {
  const data = readStore();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateMixedCode(8);
    if (!data.indexes.roleByOrgCode[orgRoleCodeKey(organizationId, code)]) {
      return code;
    }
  }
  throw new AppError('Could not generate a unique role id', 500);
}

function toPublicRole(role: StoredStaffRole, assignedCount = 0) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    createdAt: role.createdAt,
    assignedCount,
  };
}

function toPublicStaff(user: StoredUser, role: StoredStaffRole | undefined) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    roleId: user.staffRoleId || null,
    accountCode: user.staffCode || null,
    roleCode: role?.code || null,
    roleName: role?.name || null,
    allowedPages: normalizeStaffPages(user.allowedPages, {
      legacyFull: user.allowedPages === undefined,
    }),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function listStaffPage(
  organizationId: string | null | undefined,
  page = 1,
  limit = PAGE_SIZE,
  roleId = ''
) {
  const orgId = assertOrgAdmin(organizationId);
  const data = readStore();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  const ids = roleId
    ? data.indexes.staffIdsByOrgRole[orgRoleStaffKey(orgId, roleId)] || []
    : data.indexes.staffIdsByOrg[orgId] || [];
  const total = ids.length;
  const start = (safePage - 1) * safeLimit;
  const pageIds = ids.slice(start, start + safeLimit);
  const usersById = new Map(data.users.map((user) => [user.id, user]));
  const rolesById = new Map(data.staffRoles.map((role) => [role.id, role]));
  const items = pageIds
    .map((id) => usersById.get(id))
    .filter((user): user is StoredUser => Boolean(user && user.role === 'staff'))
    .map((user) => toPublicStaff(user, user.staffRoleId ? rolesById.get(user.staffRoleId) : undefined));

  const roleIds = data.indexes.roleIdsByOrg[orgId] || [];
  const roles = roleIds
    .map((id) => rolesById.get(id))
    .filter((role): role is StoredStaffRole => Boolean(role))
    .map((role) =>
      toPublicRole(role, (data.indexes.staffIdsByOrgRole[orgRoleStaffKey(orgId, role.id)] || []).length)
    );

  const summary = data.staffSummaries[orgId] || {
    organizationId: orgId,
    totalStaff: 0,
    totalRoles: 0,
    totalActive: 0,
    updatedAt: now(),
  };

  return {
    summary: {
      totalStaff: summary.totalStaff,
      totalRoles: summary.totalRoles,
      totalActive: summary.totalActive,
    },
    roles,
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export function createStaffRole(organizationId: string | null | undefined, input: CreateRoleInput) {
  const orgId = assertOrgAdmin(organizationId);
  const name = assertRoleName(input.name);
  const data = readStore();

  if (data.indexes.roleByOrgName[orgRoleNameKey(orgId, name)]) {
    throw new AppError('A role with this name already exists', 409);
  }

  const timestamp = now();
  const role: StoredStaffRole = {
    id: randomUUID(),
    organizationId: orgId,
    code: uniqueRoleCode(orgId),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return toPublicRole(addStaffRole(role));
}

export function deleteStaffRole(organizationId: string | null | undefined, roleId: string) {
  const orgId = assertOrgAdmin(organizationId);
  const role = findRoleById(roleId);
  if (!role || role.organizationId !== orgId) {
    throw new AppError('Role not found', 404);
  }

  const assigned = readStore().indexes.staffIdsByOrgRole[orgRoleStaffKey(orgId, roleId)] || [];
  if (assigned.length > 0) {
    throw new AppError('This role is assigned to staff. Delete those accounts first, then delete the role.', 409);
  }

  removeStaffRole(role, now());
}

export function createStaffAccount(organizationId: string | null | undefined, input: CreateStaffInput) {
  const orgId = assertOrgAdmin(organizationId);
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const data = readStore();

  const role = findRoleById(input.roleId);
  if (!role || role.organizationId !== orgId) {
    throw new AppError('Create a role before adding staff, then choose it here', 400);
  }
  if (RESERVED_ROLE.test(role.name)) {
    throw new AppError('Admin role cannot be assigned', 400);
  }

  const allowedPages = normalizeStaffPages(input.allowedPages);
  if (!allowedPages.length) {
    throw new AppError('Select at least one dashboard page for this staff account', 400);
  }

  if (data.indexes.userByEmail[email] || findUserByEmail(email)) {
    throw new AppError('An account with this email already exists', 409);
  }
  if (data.indexes.staffByOrgPhone[orgPhoneKey(orgId, phone)]) {
    throw new AppError('This mobile number is already used in your organisation', 409);
  }
  if (data.indexes.staffByOrgName[orgNameKey(orgId, fullName)]) {
    throw new AppError('A staff member with this name already exists', 409);
  }

  const timestamp = now();
  const user: StoredUser = {
    id: randomUUID(),
    email,
    passwordHash: hashPassword(input.password),
    fullName,
    phone,
    role: 'staff',
    organizationId: orgId,
    staffRoleId: role.id,
    staffCode: uniqueStaffCode(data, orgId),
    allowedPages,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    supabaseId: null,
  };

  const saved = addStaffUser(user);
  void ensureSupabaseAuthUser({
    email,
    password: input.password,
    fullName,
    phone,
    role: 'staff',
    organizationId: orgId,
    emailConfirm: true,
  }).then((authId) => {
    if (authId) upsertUser({ ...saved, supabaseId: authId, updatedAt: now() });
  });

  return toPublicStaff(saved, role);
}

export function updateStaffAccount(
  organizationId: string | null | undefined,
  staffId: string,
  input: UpdateStaffInput
) {
  const orgId = assertOrgAdmin(organizationId);
  const existing = findUserById(staffId);
  if (!existing || existing.role !== 'staff' || existing.organizationId !== orgId) {
    throw new AppError('Staff account not found', 404);
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const data = readStore();

  const role = findRoleById(input.roleId);
  if (!role || role.organizationId !== orgId) {
    throw new AppError('Select a valid role', 400);
  }

  const allowedPages = normalizeStaffPages(input.allowedPages);
  if (!allowedPages.length) {
    throw new AppError('Select at least one dashboard page for this staff account', 400);
  }

  const emailOwner = data.indexes.userByEmail[email];
  if (emailOwner && emailOwner !== existing.id) {
    throw new AppError('An account with this email already exists', 409);
  }
  const phoneOwner = data.indexes.staffByOrgPhone[orgPhoneKey(orgId, phone)];
  if (phoneOwner && phoneOwner !== existing.id) {
    throw new AppError('This mobile number is already used in your organisation', 409);
  }
  const nameOwner = data.indexes.staffByOrgName[orgNameKey(orgId, fullName)];
  if (nameOwner && nameOwner !== existing.id) {
    throw new AppError('A staff member with this name already exists', 409);
  }

  const next: StoredUser = {
    ...existing,
    email,
    fullName,
    phone,
    staffRoleId: role.id,
    allowedPages,
    passwordHash: input.password ? hashPassword(input.password) : existing.passwordHash,
    updatedAt: now(),
  };

  return toPublicStaff(updateStaffUser(existing, next), role);
}

export function setStaffActive(
  organizationId: string | null | undefined,
  staffId: string,
  isActive: boolean
) {
  const orgId = assertOrgAdmin(organizationId);
  const existing = findUserById(staffId);
  if (!existing || existing.role !== 'staff' || existing.organizationId !== orgId) {
    throw new AppError('Staff account not found', 404);
  }
  if (existing.isActive === isActive) {
    const role = existing.staffRoleId ? findRoleById(existing.staffRoleId) : undefined;
    return toPublicStaff(existing, role);
  }

  const next: StoredUser = {
    ...existing,
    isActive,
    updatedAt: now(),
  };
  const role = next.staffRoleId ? findRoleById(next.staffRoleId) : undefined;
  return toPublicStaff(updateStaffUser(existing, next), role);
}

export function deleteStaffAccount(organizationId: string | null | undefined, staffId: string) {
  const orgId = assertOrgAdmin(organizationId);
  const existing = findUserById(staffId);
  if (!existing || existing.role !== 'staff' || existing.organizationId !== orgId) {
    throw new AppError('Staff account not found', 404);
  }
  removeStaffUser(existing, now());
}
