import { randomUUID } from 'crypto';
import AppError from '../utils/AppError';
import { now } from '../utils/helpers';
import {
  findOrganizationById,
  findQrCodeById,
  findQrCodeByPublicCode,
  listQrCodesByOrg,
  mutateStore,
  removeQrCode,
  uniqueQrPublicCode,
} from '../data/appStore';
import type { StoredQrCode } from '../types/auth';

const MAX_COUNT = 99;

function requireOrgId(organizationId: string | null | undefined): string {
  if (!organizationId) throw new AppError('Organisation context is required', 403);
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  return organization.id;
}

export function toPublicQr(item: StoredQrCode, organizationName: string) {
  return {
    id: item.id,
    label: item.label,
    publicCode: item.publicCode,
    organizationName,
    createdAt: item.createdAt,
  };
}

export function listQrCodes(organizationId: string | null | undefined) {
  const orgId = requireOrgId(organizationId);
  const organization = findOrganizationById(orgId);
  const items = listQrCodesByOrg(orgId).map((item) => toPublicQr(item, organization?.name || 'Organisation'));
  return { total: items.length, items };
}

export function getQrCode(organizationId: string | null | undefined, id: string) {
  const orgId = requireOrgId(organizationId);
  const item = findQrCodeById(id);
  if (!item || item.organizationId !== orgId) throw new AppError('QR code not found', 404);
  const organization = findOrganizationById(orgId);
  return toPublicQr(item, organization?.name || 'Organisation');
}

export function generateQrCodes(organizationId: string | null | undefined, count: number) {
  const orgId = requireOrgId(organizationId);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new AppError(`Enter a number from 1 to ${MAX_COUNT}`, 400);
  }

  const organization = findOrganizationById(orgId);
  const created = mutateStore((data) => {
    const existing = data.qrCodes.filter((item) => item.organizationId === orgId);
    const nextNumber =
      existing.reduce((max, item) => {
        const parsed = Number(item.label.replace(/^G/i, ''));
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 0) + 1;

    const timestamp = now();
    const codes: StoredQrCode[] = [];
    for (let index = 0; index < count; index += 1) {
      codes.push({
        id: randomUUID(),
        organizationId: orgId,
        label: `G${nextNumber + index}`,
        publicCode: uniqueQrPublicCode(data),
        createdAt: timestamp,
      });
      data.qrCodes.push(codes[index]);
    }
    return codes;
  });

  return {
    total: listQrCodesByOrg(orgId).length,
    items: created.map((item) => toPublicQr(item, organization?.name || 'Organisation')),
  };
}

export function getVisitByCode(publicCode: string) {
  const item = findQrCodeByPublicCode(publicCode);
  if (!item) throw new AppError('QR code not found', 404);
  const organization = findOrganizationById(item.organizationId);
  if (!organization || !organization.isActive) throw new AppError('Organisation not found', 404);
  return {
    organizationName: organization.name,
    label: item.label,
    publicCode: item.publicCode,
  };
}

export function deleteQrCode(organizationId: string | null | undefined, id: string) {
  const orgId = requireOrgId(organizationId);
  const item = findQrCodeById(id);
  if (!item || item.organizationId !== orgId) throw new AppError('QR code not found', 404);
  const removed = removeQrCode(id, orgId);
  if (!removed) throw new AppError('QR code not found', 404);
  const organization = findOrganizationById(orgId);
  return toPublicQr(removed, organization?.name || 'Organisation');
}
