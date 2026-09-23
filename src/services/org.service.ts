import fs from 'fs';
import path from 'path';
import env from '../config/env';
import { findOrganizationById, updateOrganization } from '../data/appStore';
import AppError from '../utils/AppError';
import { now } from '../utils/helpers';
import type { StoredOrganization } from '../types/auth';

export const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireOrg(organizationId: string | null | undefined): StoredOrganization {
  if (!organizationId) throw new AppError('Organisation context is required', 403);
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  return organization;
}

export function toPresence(organization: StoredOrganization) {
  return {
    logoFile: organization.logoFile || null,
    welcomeImageFile: organization.welcomeImageFile || null,
    website: organization.website || null,
    workingDays: organization.workingDays || null,
    openingTime: organization.openingTime || null,
    closingTime: organization.closingTime || null,
    googleReviewEnabled: Boolean(organization.googleReviewEnabled),
    googleReviewUrl: organization.googleReviewUrl || null,
  };
}

export function getPresence(organizationId: string | null | undefined) {
  return toPresence(requireOrg(organizationId));
}

function save(organization: StoredOrganization, patch: Partial<StoredOrganization>) {
  return toPresence(
    updateOrganization({
      ...organization,
      ...patch,
      updatedAt: now(),
    })
  );
}

export function setWebsite(organizationId: string | null | undefined, website: string) {
  const trimmed = website.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) {
    throw new AppError('Enter a valid URL with http:// or https://', 400);
  }
  return save(requireOrg(organizationId), { website: trimmed });
}

export function clearWebsite(organizationId: string | null | undefined) {
  return save(requireOrg(organizationId), { website: null });
}

function extractMapsFeatureId(url: string) {
  const fromData = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (fromData?.[1]) return fromData[1];
  const fromLrd = url.match(/[#&]lrd=(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/i);
  if (fromLrd?.[1]) return fromLrd[1];
  const loose = url.match(/(?:^|[!/?&=])1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (loose?.[1]) return loose[1];
  const pair = url.match(/(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (pair?.[1] && /maps\.google|google\.[^/]+\/maps|maps\.app\.goo\.gl|lrd=|writereview/i.test(url)) {
    return pair[1];
  }
  return null;
}

function extractMapsPlaceName(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/maps\/place\/([^/]+)/i);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() || null;
  } catch {
    return null;
  }
}

function isShortMapsLink(url: string) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url);
}

function isMapsLikeLink(url: string) {
  return (
    isShortMapsLink(url) ||
    /google\.[^/]+\/maps/i.test(url) ||
    /maps\.google\./i.test(url) ||
    /g\.page\//i.test(url) ||
    /search\.google\.com\/local\/writereview/i.test(url)
  );
}

async function resolveMapsRedirect(url: string) {
  if (!isShortMapsLink(url)) return url;
  try {
    const first = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12_000),
    });
    const location = first.headers.get('location');
    if (location) return location;
    const followed = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12_000),
    });
    return followed.url || url;
  } catch {
    return url;
  }
}

/**
 * Direct Write-a-review URL (stars dialog) — same as clicking Google’s “Write a review” button.
 * Hex feature IDs must NOT use search.google.com/local/writereview (404).
 * Official Maps writeAReviewUri: /maps/place//data=!4m3!3m2!1s{FEATURE_ID}!12e1
 * @see https://developers.google.com/maps/documentation/places/web-service/maps-links
 */
export function toGoogleWriteReviewUrl(raw: string, _placeNameHint?: string | null) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Already official Maps write-review deep link
  if (/google\.[^/]+\/maps\/place\/.*data=.*!12e1/i.test(trimmed) || /!12e1(?:!|$|&)/i.test(trimmed)) {
    const fid = extractMapsFeatureId(trimmed);
    if (fid) return `https://www.google.com/maps/place//data=!4m3!3m2!1s${fid}!12e1`;
    return trimmed;
  }
  if (/g\.page\/r\/[^/?#]+\/review\/?/i.test(trimmed)) return trimmed.replace(/\/?$/, '');
  if (/search\.google\.com\/local\/writereview\?placeid=ChIJ/i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const placeFromQuery =
      parsed.searchParams.get('placeid') ||
      parsed.searchParams.get('place_id') ||
      parsed.searchParams.get('query_place_id');
    if (placeFromQuery && /^ChIJ/i.test(placeFromQuery)) {
      return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeFromQuery)}`;
    }
  } catch {
    // continue
  }

  const chij = trimmed.match(/(ChIJ[\w-]+)/)?.[1];
  if (chij) return `https://search.google.com/local/writereview?placeid=${chij}`;

  const gPage = trimmed.match(/https?:\/\/(?:www\.)?g\.page\/r\/([^/?#]+)/i);
  if (gPage?.[1]) return `https://g.page/r/${gPage[1]}/review`;

  let featureId = extractMapsFeatureId(trimmed);
  if (!featureId) {
    const broken = trimmed.match(
      /writereview\?placeid=((?:0x[0-9a-fA-F]+%3A0x[0-9a-fA-F]+)|(?:0x[0-9a-fA-F]+:0x[0-9a-fA-F]+))/i
    );
    if (broken?.[1]) featureId = decodeURIComponent(broken[1]);
  }

  if (featureId) {
    // Official Google writeAReviewUri — opens Write a review dialog directly
    return `https://www.google.com/maps/place//data=!4m3!3m2!1s${featureId}!12e1`;
  }

  return trimmed;
}

export async function resolveGoogleWriteReviewUrl(raw: string, placeNameHint?: string | null) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  let source = trimmed;
  if (isShortMapsLink(trimmed)) {
    source = await resolveMapsRedirect(trimmed);
  }
  return toGoogleWriteReviewUrl(source, placeNameHint || extractMapsPlaceName(source));
}

export async function setGoogleReviewUrl(organizationId: string | null | undefined, url: string) {
  const organization = requireOrg(organizationId);
  const trimmed = url.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) {
    throw new AppError('Enter a valid Google Maps share link with http:// or https://', 400);
  }
  const normalized = await resolveGoogleWriteReviewUrl(trimmed, organization.name);
  if (/writereview\?placeid=0x/i.test(normalized)) {
    throw new AppError('Could not build Write a review link. Paste a Google Maps share link (maps.app.goo.gl).', 400);
  }
  if (isShortMapsLink(trimmed) && (normalized === trimmed || isShortMapsLink(normalized))) {
    throw new AppError('Could not open this Maps short link. Try again or paste the full Google Maps URL.', 400);
  }
  return save(organization, {
    googleReviewUrl: normalized,
    googleReviewEnabled: true,
  });
}

export function clearGoogleReviewUrl(organizationId: string | null | undefined) {
  return save(requireOrg(organizationId), {
    googleReviewUrl: null,
    googleReviewEnabled: false,
  });
}

export function setGoogleReviewEnabled(organizationId: string | null | undefined, enabled: boolean) {
  const organization = requireOrg(organizationId);
  const hasReviewUrl = Boolean(organization.googleReviewUrl?.trim());
  const websiteMaps = Boolean(organization.website?.trim() && isMapsLikeLink(organization.website));
  if (enabled && !hasReviewUrl && !websiteMaps) {
    throw new AppError(
      'Add a Google Maps share link (Active Fields), or set Organisation website to a Maps link, then activate',
      400
    );
  }
  return save(organization, { googleReviewEnabled: Boolean(enabled) });
}

/** Copy Organisation website (Maps share link) into Google Review and convert to Write a review */
export async function syncGoogleReviewFromWebsite(organizationId: string | null | undefined) {
  const organization = requireOrg(organizationId);
  const website = organization.website?.trim();
  if (!website) {
    throw new AppError('Add a website / Maps link on Organisation page first', 400);
  }
  if (!isMapsLikeLink(website) && !/^https?:\/\//i.test(website)) {
    throw new AppError('Organisation website must be a Google Maps share link for Write a review', 400);
  }
  // If normal website (not maps), still try Maps search write-review by org name — weak fallback
  if (!isMapsLikeLink(website)) {
    const fallback = `https://www.google.com/search?q=${encodeURIComponent(`${organization.name} reviews`)}`;
    return save(organization, {
      googleReviewUrl: fallback,
      googleReviewEnabled: true,
    });
  }
  const normalized = await resolveGoogleWriteReviewUrl(website, organization.name);
  return save(organization, {
    googleReviewUrl: normalized,
    googleReviewEnabled: true,
  });
}

export function buildGoogleReviewLink(organization: StoredOrganization) {
  if (!organization.googleReviewEnabled) return null;
  const preferred = organization.googleReviewUrl?.trim();
  if (preferred) return toGoogleWriteReviewUrl(preferred, organization.name);
  const website = organization.website?.trim();
  if (website && isMapsLikeLink(website)) return toGoogleWriteReviewUrl(website, organization.name);
  return null;
}

export function setWorkingDays(organizationId: string | null | undefined, days: string[]) {
  const unique = [...new Set(days)].filter((day) => WEEK_DAYS.includes(day as (typeof WEEK_DAYS)[number]));
  if (!unique.length) {
    throw new AppError('Select at least one working day', 400);
  }
  return save(requireOrg(organizationId), { workingDays: unique });
}

export function clearWorkingDays(organizationId: string | null | undefined) {
  return save(requireOrg(organizationId), { workingDays: null });
}

export function setOpeningTime(organizationId: string | null | undefined, time: string) {
  if (!TIME.test(time)) throw new AppError('Enter a valid opening time', 400);
  const organization = requireOrg(organizationId);
  if (organization.closingTime && time >= organization.closingTime) {
    throw new AppError('Opening time must be before closing time', 400);
  }
  return save(organization, { openingTime: time });
}

export function clearOpeningTime(organizationId: string | null | undefined) {
  return save(requireOrg(organizationId), { openingTime: null });
}

export function setClosingTime(organizationId: string | null | undefined, time: string) {
  if (!TIME.test(time)) throw new AppError('Enter a valid closing time', 400);
  const organization = requireOrg(organizationId);
  if (organization.openingTime && organization.openingTime >= time) {
    throw new AppError('Closing time must be after opening time', 400);
  }
  return save(organization, { closingTime: time });
}

export function clearClosingTime(organizationId: string | null | undefined) {
  return save(requireOrg(organizationId), { closingTime: null });
}

export function setLogo(organizationId: string | null | undefined, filename: string) {
  const organization = requireOrg(organizationId);
  if (organization.logoFile) {
    const previous = path.join(process.cwd(), env.UPLOAD_DIR, organization.logoFile);
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
  }
  return save(organization, { logoFile: filename });
}

export function clearLogo(organizationId: string | null | undefined) {
  const organization = requireOrg(organizationId);
  if (organization.logoFile) {
    const previous = path.join(process.cwd(), env.UPLOAD_DIR, organization.logoFile);
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
  }
  return save(organization, { logoFile: null });
}

export function setWelcomeImage(organizationId: string | null | undefined, filename: string) {
  const organization = requireOrg(organizationId);
  if (organization.welcomeImageFile) {
    const previous = path.join(process.cwd(), env.UPLOAD_DIR, organization.welcomeImageFile);
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
  }
  return save(organization, { welcomeImageFile: filename });
}

export function clearWelcomeImage(organizationId: string | null | undefined) {
  const organization = requireOrg(organizationId);
  if (organization.welcomeImageFile) {
    const previous = path.join(process.cwd(), env.UPLOAD_DIR, organization.welcomeImageFile);
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
  }
  return save(organization, { welcomeImageFile: null });
}
