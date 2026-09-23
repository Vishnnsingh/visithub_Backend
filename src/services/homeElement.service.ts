import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import env from '../config/env';
import { findOrganizationById, getHomeLayout, saveHomeLayout } from '../data/appStore';
import AppError from '../utils/AppError';
import { now } from '../utils/helpers';
import type {
  HomeBlock,
  HomeCard,
  HomeImageBlock,
  HomeLayout,
  HomeLinkIconStyle,
  HomeLinkItem,
  HomeLinkPlatform,
  HomeLinksBlock,
  HomeSlotId,
  HomeTextBlock,
  HomeTextKind,
  HomeTextStyle,
} from '../types/auth';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HOME_SLOTS: HomeSlotId[] = ['meetingBoard', 'googleReview', 'cards'];
const DEFAULT_HOME_SLOT_ORDER: HomeSlotId[] = ['meetingBoard', 'cards', 'googleReview'];

export function normalizeHomeSlotOrder(raw: unknown): HomeSlotId[] {
  const seen = new Set<HomeSlotId>();
  const next: HomeSlotId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      if (!(HOME_SLOTS as string[]).includes(item)) continue;
      const slot = item as HomeSlotId;
      if (seen.has(slot)) continue;
      seen.add(slot);
      next.push(slot);
    }
  }
  for (const slot of DEFAULT_HOME_SLOT_ORDER) {
    if (!seen.has(slot)) next.push(slot);
  }
  return next;
}
const MAX_IMAGES = 5;
const MAX_URL_IMAGES = 50;
const MAX_TEXT = 500;
const MIN_WORDS = 1;
const MAX_WORDS = 100;
const MAX_LINKS = 5;
const MAX_SPACE = 48;
const MAX_URL = 500;
const LINK_PLATFORMS: HomeLinkPlatform[] = [
  'instagram',
  'facebook',
  'whatsapp',
  'youtube',
  'linkedin',
  'twitter',
  'x',
  'custom',
];
const LINK_ICON_STYLES: HomeLinkIconStyle[] = ['filled', 'outline', 'soft', 'minimal'];
const ALLOWED_FONTS = [
  'Plus Jakarta Sans',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Nunito',
  'Raleway',
  'Ubuntu',
  'Source Sans 3',
  'Work Sans',
  'DM Sans',
  'Manrope',
  'Outfit',
  'Rubik',
  'Mulish',
  'Josefin Sans',
  'Playfair Display',
  'Merriweather',
  'Lora',
  'Libre Baskerville',
  'Cormorant Garamond',
  'Bebas Neue',
  'Oswald',
  'Space Grotesk',
  'Pacifico',
  'Dancing Script',
] as const;

function defaultStyle(overrides?: Partial<HomeTextStyle>): HomeTextStyle {
  return {
    fontSize: 16,
    fontWeight: 'semibold',
    fontStyle: 'normal',
    fontFamily: 'Plus Jakarta Sans',
    color: '#111827',
    align: 'center',
    rotate: 0,
    curve: 'none',
    decoration: 'none',
    letterSpacing: 0,
    textTransform: 'none',
    ...overrides,
  };
}

function normalizeFontFamily(raw: string | undefined, fallback: string) {
  const value = String(raw || '').trim();
  return (ALLOWED_FONTS as readonly string[]).includes(value) ? value : fallback;
}

function defaultMaxWords(kind: HomeTextKind) {
  if (kind === 'subtitle') return 12;
  if (kind === 'heading') return 20;
  return 60;
}

function clampMaxWords(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_WORDS, Math.max(MIN_WORDS, Math.round(n)));
}

function limitToWords(text: string, maxWords: number) {
  const limit = clampMaxWords(maxWords, 30);
  const parts = text.trimStart().split(/(\s+)/);
  let words = 0;
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      if (words > 0) out += part;
      continue;
    }
    if (words >= limit) break;
    out += part;
    words += 1;
  }
  return out.slice(0, MAX_TEXT);
}

function makeTextBlock(kind: HomeTextKind, text: string): HomeTextBlock {
  const defaults =
    kind === 'heading'
      ? { fontSize: 24, fontWeight: 'bold' as const }
      : kind === 'subtitle'
        ? { fontSize: 12, fontWeight: 'semibold' as const, color: '#6b7280' }
        : { fontSize: 14, fontWeight: 'normal' as const };
  const maxWords = defaultMaxWords(kind);
  return {
    id: randomUUID(),
    kind,
    enabled: true,
    text: limitToWords(text, maxWords),
    style: defaultStyle(defaults),
    spaceTop: 0,
    spaceBottom: 0,
    maxWords,
  };
}

function makeCard(blocks: HomeBlock[], frame: HomeCard['frame'] = 'card'): HomeCard {
  return { id: randomUUID(), enabled: true, frame, blocks };
}

function normalizeCardFrame(value: unknown): HomeCard['frame'] {
  if (value === 'plain' || value === 'round' || value === 'circle' || value === 'card') return value;
  return 'card';
}

const BG_THEMES = ['default', 'mint', 'blossom', 'lavender', 'peach', 'sky', 'citrus'] as const;

function normalizeBgTheme(value: unknown): (typeof BG_THEMES)[number] {
  return typeof value === 'string' && (BG_THEMES as readonly string[]).includes(value)
    ? (value as (typeof BG_THEMES)[number])
    : 'default';
}

export function defaultHomeLayout(organizationName: string): HomeLayout {
  const name = String(organizationName || '').trim() || 'Organisation';

  const welcomeSub = makeTextBlock('subtitle', 'Welcome to');
  welcomeSub.style = defaultStyle({
    fontSize: 11,
    fontWeight: 'semibold',
    fontFamily: 'Manrope',
    color: '#0d9488',
    letterSpacing: 4,
    textTransform: 'uppercase',
  });
  const welcomeHead = makeTextBlock('heading', name);
  welcomeHead.style = defaultStyle({
    fontSize: 28,
    fontWeight: 'bold',
    fontFamily: 'Playfair Display',
    color: '#0f172a',
    curve: 'none',
  });
  welcomeHead.spaceTop = 4;
  const welcomePara = makeTextBlock(
    'paragraph',
    'Check in, meet your host, and share visit feedback — all in one place.'
  );
  welcomePara.style = defaultStyle({
    fontSize: 14,
    fontWeight: 'normal',
    fontStyle: 'italic',
    fontFamily: 'DM Sans',
    color: '#475569',
  });
  welcomePara.spaceTop = 10;
  const welcomeImage: HomeImageBlock = {
    id: randomUUID(),
    kind: 'image',
    enabled: true,
    source: 'url',
    file: '',
    url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80',
    spaceTop: 16,
    spaceBottom: 2,
  };

  const visitSub = makeTextBlock('subtitle', 'Your visit');
  visitSub.style = defaultStyle({
    fontSize: 11,
    fontWeight: 'semibold',
    fontFamily: 'Space Grotesk',
    color: '#0284c8',
    letterSpacing: 4,
    textTransform: 'uppercase',
    decoration: 'underline',
  });
  const visitHead = makeTextBlock('heading', 'Smooth from arrival to feedback');
  visitHead.style = defaultStyle({
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Outfit',
    color: '#0f172a',
    rotate: 0,
    curve: 'none',
  });
  visitHead.spaceTop = 6;
  const visitPara = makeTextBlock(
    'paragraph',
    'Scan the QR, tell us who you are meeting, and leave a quick rating when you leave. It helps us improve every visit.'
  );
  visitPara.style = defaultStyle({
    fontSize: 14,
    fontWeight: 'normal',
    fontFamily: 'Source Sans 3',
    color: '#475569',
  });
  visitPara.spaceTop = 10;
  const visitImage: HomeImageBlock = {
    id: randomUUID(),
    kind: 'image',
    enabled: true,
    source: 'url',
    file: '',
    url: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=900&q=80',
    spaceTop: 14,
    spaceBottom: 0,
  };

  const connectSub = makeTextBlock('subtitle', 'Stay connected');
  connectSub.style = defaultStyle({
    fontSize: 11,
    fontWeight: 'semibold',
    fontFamily: 'Josefin Sans',
    color: '#be185d',
    letterSpacing: 4,
    textTransform: 'uppercase',
  });
  const connectHead = makeTextBlock('heading', `Follow ${name}`);
  connectHead.style = defaultStyle({
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Pacifico',
    color: '#9d174d',
    curve: 'none',
  });
  connectHead.spaceTop = 4;
  const connectPara = makeTextBlock(
    'paragraph',
    'Updates, announcements, and support — replace these links with your own social profiles anytime.'
  );
  connectPara.style = defaultStyle({
    fontSize: 13,
    fontWeight: 'normal',
    fontStyle: 'italic',
    fontFamily: 'Nunito',
    color: '#64748b',
  });
  connectPara.spaceTop = 8;
  const links: HomeLinksBlock = {
    id: randomUUID(),
    kind: 'links',
    enabled: true,
    iconStyle: 'filled',
    items: (
      [
        ['instagram', 'https://instagram.com'],
        ['whatsapp', 'https://wa.me'],
        ['linkedin', 'https://linkedin.com'],
        ['youtube', 'https://youtube.com'],
      ] as Array<[HomeLinkPlatform, string]>
    ).map(([platform, url]) => ({
      id: randomUUID(),
      platform,
      url,
      label: '',
      enabled: true,
    })),
    spaceTop: 16,
    spaceBottom: 2,
  };

  const thanksSub = makeTextBlock('subtitle', 'Thank you');
  thanksSub.style = defaultStyle({
    fontSize: 11,
    fontWeight: 'semibold',
    fontFamily: 'Raleway',
    color: '#7c3aed',
    letterSpacing: 4,
    textTransform: 'uppercase',
  });
  const thanksHead = makeTextBlock('heading', 'Every visit helps us grow');
  thanksHead.style = defaultStyle({
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Lora',
    color: '#1e1b4b',
    curve: 'none',
  });
  thanksHead.spaceTop = 6;
  const thanksPara = makeTextBlock(
    'paragraph',
    'Your check-in and feedback keep our space welcoming. We are glad you are here — see you again soon.'
  );
  thanksPara.style = defaultStyle({
    fontSize: 14,
    fontWeight: 'normal',
    fontStyle: 'italic',
    fontFamily: 'Cormorant Garamond',
    color: '#57534e',
  });
  thanksPara.spaceTop = 10;
  const thanksImage: HomeImageBlock = {
    id: randomUUID(),
    kind: 'image',
    enabled: true,
    source: 'url',
    file: '',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80',
    spaceTop: 14,
    spaceBottom: 2,
  };

  const card1 = makeCard([welcomeSub, welcomeHead, welcomePara, welcomeImage], 'round');
  const card2 = makeCard([visitSub, visitHead, visitPara, visitImage], 'plain');
  const card3 = makeCard([connectSub, connectHead, connectPara, links], 'circle');
  const card4 = makeCard([thanksSub, thanksHead, thanksPara, thanksImage], 'round');

  return {
    bgTheme: 'mint',
    meetingBoardEnabled: false,
    homeSlotOrder: [...DEFAULT_HOME_SLOT_ORDER],
    cards: [card1, card2, card3, card4],
    updatedAt: now(),
  };
}

function requireOrg(organizationId: string | null | undefined) {
  if (!organizationId) throw new AppError('Organisation context is required', 403);
  const organization = findOrganizationById(organizationId);
  if (!organization) throw new AppError('Organisation not found', 404);
  return organization;
}

function normalizeStyle(raw: Partial<HomeTextStyle> | undefined, fallback: HomeTextStyle): HomeTextStyle {
  const fontSize = Number(raw?.fontSize ?? fallback.fontSize);
  const color = String(raw?.color || fallback.color).trim();
  const rotate = Number(raw?.rotate ?? fallback.rotate ?? 0);
  const letterSpacing = Number(raw?.letterSpacing ?? fallback.letterSpacing ?? 0);
  return {
    fontSize: Number.isFinite(fontSize) ? Math.min(40, Math.max(10, Math.round(fontSize))) : fallback.fontSize,
    fontWeight:
      raw?.fontWeight === 'normal' || raw?.fontWeight === 'bold' || raw?.fontWeight === 'semibold'
        ? raw.fontWeight
        : fallback.fontWeight,
    fontStyle: raw?.fontStyle === 'italic' ? 'italic' : 'normal',
    fontFamily: normalizeFontFamily(raw?.fontFamily, fallback.fontFamily || 'Plus Jakarta Sans'),
    color: HEX.test(color) ? color : fallback.color,
    align: raw?.align === 'left' || raw?.align === 'right' ? raw.align : 'center',
    rotate: Number.isFinite(rotate) ? Math.min(45, Math.max(-45, Math.round(rotate))) : 0,
    curve: raw?.curve === 'up' || raw?.curve === 'down' ? raw.curve : 'none',
    decoration: raw?.decoration === 'underline' || raw?.decoration === 'line-through' ? raw.decoration : 'none',
    letterSpacing: Number.isFinite(letterSpacing) ? Math.min(16, Math.max(0, Math.round(letterSpacing))) : 0,
    textTransform:
      raw?.textTransform === 'uppercase' ||
      raw?.textTransform === 'lowercase' ||
      raw?.textTransform === 'capitalize'
        ? raw.textTransform
        : 'none',
  };
}

function unlinkUpload(filename: string | null | undefined) {
  if (!filename) return;
  const filePath = path.join(process.cwd(), env.UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function isTextKind(kind: unknown): kind is HomeTextKind {
  return kind === 'heading' || kind === 'subtitle' || kind === 'paragraph';
}

function isLinkPlatform(value: unknown): value is HomeLinkPlatform {
  return typeof value === 'string' && LINK_PLATFORMS.includes(value as HomeLinkPlatform);
}

function isLinkIconStyle(value: unknown): value is HomeLinkIconStyle {
  return typeof value === 'string' && LINK_ICON_STYLES.includes(value as HomeLinkIconStyle);
}

function normalizeUrl(raw: string) {
  const value = raw.trim().slice(0, MAX_URL);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(wa\.me|api\.whatsapp\.com|www\.)/i.test(value)) return `https://${value}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;
  return value;
}

function normalizeLinkItem(raw: Partial<HomeLinkItem> | undefined): HomeLinkItem | null {
  if (!raw || !isLinkPlatform(raw.platform)) return null;
  const url = normalizeUrl(typeof raw.url === 'string' ? raw.url : '');
  const label =
    raw.platform === 'custom'
      ? String(raw.label || 'Link').trim().slice(0, 40) || 'Link'
      : String(raw.label || '').trim().slice(0, 40);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID(),
    platform: raw.platform,
    url,
    label,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
  };
}

function normalizeLinksBlock(raw: Partial<HomeLinksBlock> & { kind?: string }): HomeLinksBlock | null {
  if (raw.kind !== 'links') return null;
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items: HomeLinkItem[] = [];
  for (const item of itemsRaw) {
    if (items.length >= MAX_LINKS) break;
    const normalized = normalizeLinkItem(item as Partial<HomeLinkItem>);
    if (normalized) items.push(normalized);
  }
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID(),
    kind: 'links',
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    iconStyle: isLinkIconStyle(raw.iconStyle) ? raw.iconStyle : 'filled',
    items,
    spaceTop: clampSpace(raw.spaceTop, 8),
    spaceBottom: clampSpace(raw.spaceBottom, 8),
  };
}

function allBlocks(cards: HomeCard[]) {
  return cards.flatMap((card) => card.blocks);
}

function countImages(cards: HomeCard[]) {
  return allBlocks(cards).filter((item) => item.kind === 'image' && isUploadImage(item)).length;
}

function imageBlocks(cards: HomeCard[]): HomeImageBlock[] {
  return allBlocks(cards).filter((item): item is HomeImageBlock => item.kind === 'image');
}

function isUploadImage(block: HomeImageBlock) {
  return block.source === 'upload' || (Boolean(block.file) && !block.url);
}

function isUrlImage(block: HomeImageBlock) {
  return block.source === 'url' || (Boolean(block.url) && !block.file);
}

function normalizeImageUrl(raw: string) {
  const value = normalizeUrl(raw);
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return '';
  return value.slice(0, MAX_URL);
}

function clampSpace(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_SPACE, Math.max(0, Math.round(n)));
}

function normalizeTextFromBody(raw: Partial<HomeTextBlock> & { kind?: string }): HomeTextBlock | null {
  if (!isTextKind(raw.kind)) return null;
  const kind = raw.kind;
  const fallbackStyle =
    kind === 'heading'
      ? defaultStyle({ fontSize: 24, fontWeight: 'bold' })
      : kind === 'subtitle'
        ? defaultStyle({ fontSize: 12, color: '#6b7280' })
        : defaultStyle({ fontSize: 14, fontWeight: 'normal' });
  const maxWords = clampMaxWords(raw.maxWords, defaultMaxWords(kind));
  const text =
    typeof raw.text === 'string' ? limitToWords(raw.text.trim(), maxWords) : '';
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID(),
    kind,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    text,
    style: normalizeStyle(raw.style, fallbackStyle),
    spaceTop: clampSpace(raw.spaceTop),
    spaceBottom: clampSpace(raw.spaceBottom),
    maxWords,
  };
}

function normalizeBlock(
  raw: unknown,
  currentImages: Map<string, HomeImageBlock>,
  uploadBudget: { left: number },
  urlBudget: { left: number }
): HomeBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<HomeBlock> & { kind?: string };
  if (item.kind === 'image') {
    const id = typeof item.id === 'string' ? item.id : '';
    const existing = id ? currentImages.get(id) : undefined;
    const bodyUrl = typeof (item as HomeImageBlock).url === 'string' ? (item as HomeImageBlock).url : '';
    const wantsUrl =
      (item as HomeImageBlock).source === 'url' ||
      Boolean(bodyUrl) ||
      (existing && isUrlImage(existing) && (item as HomeImageBlock).source !== 'upload');

    if (wantsUrl) {
      if (urlBudget.left <= 0) return null;
      const url = normalizeImageUrl(bodyUrl || existing?.url || '');
      if (!url) return null;
      urlBudget.left -= 1;
      return {
        id: id && id.trim() ? id.trim() : randomUUID(),
        kind: 'image',
        enabled: item.enabled === undefined ? true : Boolean(item.enabled),
        source: 'url',
        file: '',
        url,
        spaceTop: clampSpace((item as HomeImageBlock).spaceTop),
        spaceBottom: clampSpace((item as HomeImageBlock).spaceBottom),
      };
    }

    if (!existing || !isUploadImage(existing) || uploadBudget.left <= 0) return null;
    uploadBudget.left -= 1;
    return {
      id: existing.id,
      kind: 'image',
      enabled: item.enabled === undefined ? existing.enabled : Boolean(item.enabled),
      source: 'upload',
      file: existing.file,
      url: '',
      spaceTop: clampSpace((item as HomeImageBlock).spaceTop),
      spaceBottom: clampSpace((item as HomeImageBlock).spaceBottom),
    };
  }
  if (isTextKind(item.kind)) {
    return normalizeTextFromBody(item as Partial<HomeTextBlock> & { kind: HomeTextKind });
  }
  if (item.kind === 'links') {
    return normalizeLinksBlock(item as Partial<HomeLinksBlock> & { kind: string });
  }
  return null;
}

/** Migrate legacy layouts → cards */
function migrateToCards(stored: Record<string, unknown>, organizationName: string): HomeCard[] {
  if (Array.isArray(stored.cards) && stored.cards.length) {
    return (stored.cards as HomeCard[]).map((card) => ({
      id: card.id || randomUUID(),
      enabled: card.enabled !== false,
      frame: normalizeCardFrame(card.frame),
      blocks: Array.isArray(card.blocks) ? card.blocks : [],
    }));
  }

  const blocks: HomeBlock[] = [];

  if (Array.isArray(stored.blocks)) {
    blocks.push(...(stored.blocks as HomeBlock[]));
  } else {
    const subtitle = stored.subtitle as { enabled?: boolean; text?: string; style?: Partial<HomeTextStyle> } | null;
    const heading = stored.heading as { enabled?: boolean; text?: string; style?: Partial<HomeTextStyle> } | null;
    const paragraph = stored.paragraph as { enabled?: boolean; text?: string; style?: Partial<HomeTextStyle> } | null;
    const images = Array.isArray(stored.images)
      ? (stored.images as Array<{ id?: string; file: string; enabled?: boolean }>)
      : [];

    if (subtitle && typeof subtitle === 'object') {
      blocks.push({
        id: randomUUID(),
        kind: 'subtitle',
        enabled: subtitle.enabled !== false,
        text: limitToWords(String(subtitle.text || ''), defaultMaxWords('subtitle')),
        style: normalizeStyle(subtitle.style, defaultStyle({ fontSize: 12, color: '#6b7280' })),
        spaceTop: 0,
        spaceBottom: 0,
        maxWords: defaultMaxWords('subtitle'),
      });
    }
    if (heading && typeof heading === 'object') {
      blocks.push({
        id: randomUUID(),
        kind: 'heading',
        enabled: heading.enabled !== false,
        text: limitToWords(String(heading.text || organizationName), defaultMaxWords('heading')),
        style: normalizeStyle(heading.style, defaultStyle({ fontSize: 24, fontWeight: 'bold' })),
        spaceTop: 0,
        spaceBottom: 0,
        maxWords: defaultMaxWords('heading'),
      });
    }
    if (paragraph && typeof paragraph === 'object') {
      blocks.push({
        id: randomUUID(),
        kind: 'paragraph',
        enabled: paragraph.enabled !== false,
        text: limitToWords(String(paragraph.text || ''), defaultMaxWords('paragraph')),
        style: normalizeStyle(paragraph.style, defaultStyle({ fontSize: 14, fontWeight: 'normal' })),
        spaceTop: 0,
        spaceBottom: 0,
        maxWords: defaultMaxWords('paragraph'),
      });
    }
    for (const image of images.slice(0, MAX_IMAGES)) {
      if (!image?.file) continue;
      blocks.push({
        id: image.id || randomUUID(),
        kind: 'image',
        enabled: image.enabled !== false,
        source: 'upload',
        file: image.file,
        url: '',
        spaceTop: 0,
        spaceBottom: 0,
      });
    }
  }

  if (!blocks.length) return defaultHomeLayout(organizationName).cards;

  // Old cardMode separate → each block its own card; otherwise one card
  if (stored.cardMode === 'separate') {
    return blocks.map((block) => makeCard([block]));
  }
  return [makeCard(blocks)];
}

function sanitizeCards(cards: HomeCard[]): HomeCard[] {
  let uploadCount = 0;
  let urlCount = 0;
  return cards
    .map((card) => {
      const blocks = (card.blocks || [])
        .map((block) => {
          if (block.kind === 'image') {
            if (isUrlImage(block)) {
              const url = normalizeImageUrl(block.url || '');
              if (!url || urlCount >= MAX_URL_IMAGES) return null;
              urlCount += 1;
              return {
                id: block.id || randomUUID(),
                kind: 'image' as const,
                enabled: block.enabled !== false,
                source: 'url' as const,
                file: '',
                url,
                spaceTop: clampSpace(block.spaceTop),
                spaceBottom: clampSpace(block.spaceBottom),
              };
            }
            if (!block.file || uploadCount >= MAX_IMAGES) return null;
            uploadCount += 1;
            return {
              id: block.id || randomUUID(),
              kind: 'image' as const,
              enabled: block.enabled !== false,
              source: 'upload' as const,
              file: block.file,
              url: '',
              spaceTop: clampSpace(block.spaceTop),
              spaceBottom: clampSpace(block.spaceBottom),
            };
          }
          if (block.kind === 'links') {
            return normalizeLinksBlock(block);
          }
          if (!isTextKind(block.kind)) return null;
          const maxWords = clampMaxWords(block.maxWords, defaultMaxWords(block.kind));
          return {
            id: block.id || randomUUID(),
            kind: block.kind,
            enabled: block.enabled !== false,
            text: limitToWords(String(block.text || ''), maxWords),
            style: normalizeStyle(block.style, defaultStyle()),
            spaceTop: clampSpace(block.spaceTop),
            spaceBottom: clampSpace(block.spaceBottom),
            maxWords,
          };
        })
        .filter(Boolean) as HomeBlock[];
      return {
        id: card.id || randomUUID(),
        enabled: card.enabled !== false,
        frame: normalizeCardFrame(card.frame),
        blocks,
      };
    })
    .filter((card) => card.blocks.length > 0 || true);
}

export function resolveHomeLayout(organizationId: string, organizationName: string): HomeLayout {
  const stored = getHomeLayout(organizationId) as (HomeLayout & Record<string, unknown>) | null;
  if (!stored) {
    const fresh = defaultHomeLayout(organizationName);
    return saveHomeLayout(organizationId, { ...fresh, straightCurvesV1: true });
  }
  const cards = sanitizeCards(migrateToCards(stored as unknown as Record<string, unknown>, organizationName));
  const layout: HomeLayout = {
    bgTheme: normalizeBgTheme((stored as { bgTheme?: unknown }).bgTheme),
    meetingBoardEnabled: Boolean((stored as { meetingBoardEnabled?: unknown }).meetingBoardEnabled),
    homeSlotOrder: normalizeHomeSlotOrder((stored as { homeSlotOrder?: unknown }).homeSlotOrder),
    cards: cards.length ? cards : defaultHomeLayout(organizationName).cards,
    straightCurvesV1: Boolean(stored.straightCurvesV1),
    updatedAt: stored.updatedAt || now(),
  };

  // Existing orgs still had default curve up/down — flatten once to straight
  if (!layout.straightCurvesV1) {
    const flattenedCards = layout.cards.map((card) => ({
      ...card,
      blocks: card.blocks.map((block) => {
        if (block.kind !== 'heading' && block.kind !== 'subtitle' && block.kind !== 'paragraph') {
          return block;
        }
        return {
          ...block,
          style: { ...block.style, curve: 'none' as const },
        };
      }),
    }));
    return saveHomeLayout(organizationId, {
      ...layout,
      cards: flattenedCards,
      straightCurvesV1: true,
      updatedAt: now(),
    });
  }

  return layout;
}

export function getOrgHomeElement(organizationId: string | null | undefined) {
  const organization = requireOrg(organizationId);
  return resolveHomeLayout(organization.id, organization.name);
}

export function updateOrgHomeElement(
  organizationId: string | null | undefined,
  body: { cards?: unknown[]; bgTheme?: unknown; meetingBoardEnabled?: unknown; homeSlotOrder?: unknown }
) {
  const organization = requireOrg(organizationId);
  const current = resolveHomeLayout(organization.id, organization.name);
  if (!Array.isArray(body.cards)) throw new AppError('Cards are required', 400);

  const currentImages = new Map(imageBlocks(current.cards).map((item) => [item.id, item]));
  const uploadBudget = { left: MAX_IMAGES };
  const urlBudget = { left: MAX_URL_IMAGES };
  const nextCards: HomeCard[] = [];

  for (const rawCard of body.cards) {
    if (!rawCard || typeof rawCard !== 'object') continue;
    const card = rawCard as Partial<HomeCard>;
    const blocksRaw = Array.isArray(card.blocks) ? card.blocks : [];
    const blocks: HomeBlock[] = [];
    for (const rawBlock of blocksRaw) {
      const normalized = normalizeBlock(rawBlock, currentImages, uploadBudget, urlBudget);
      if (normalized) blocks.push(normalized);
    }
    nextCards.push({
      id: typeof card.id === 'string' && card.id.trim() ? card.id.trim() : randomUUID(),
      enabled: card.enabled === undefined ? true : Boolean(card.enabled),
      frame: normalizeCardFrame(card.frame),
      blocks,
    });
  }

  const keep = new Set(imageBlocks(nextCards).map((item) => item.id));
  for (const image of imageBlocks(current.cards)) {
    if (!keep.has(image.id) && isUploadImage(image) && image.file) unlinkUpload(image.file);
  }

  const next: HomeLayout = {
    bgTheme: body.bgTheme !== undefined ? normalizeBgTheme(body.bgTheme) : current.bgTheme,
    meetingBoardEnabled:
      body.meetingBoardEnabled !== undefined
        ? Boolean(body.meetingBoardEnabled)
        : Boolean(current.meetingBoardEnabled),
    homeSlotOrder:
      body.homeSlotOrder !== undefined
        ? normalizeHomeSlotOrder(body.homeSlotOrder)
        : normalizeHomeSlotOrder(current.homeSlotOrder),
    cards: nextCards.length ? nextCards : defaultHomeLayout(organization.name).cards,
    straightCurvesV1: true,
    updatedAt: now(),
  };
  return saveHomeLayout(organization.id, next);
}

export function setOrgMeetingBoardEnabled(organizationId: string | null | undefined, enabled: boolean) {
  const organization = requireOrg(organizationId);
  const current = resolveHomeLayout(organization.id, organization.name);
  const next: HomeLayout = {
    ...current,
    meetingBoardEnabled: Boolean(enabled),
    homeSlotOrder: normalizeHomeSlotOrder(current.homeSlotOrder),
    updatedAt: now(),
  };
  return saveHomeLayout(organization.id, next);
}

export function setOrgHomeSlotOrder(organizationId: string | null | undefined, order: unknown) {
  const organization = requireOrg(organizationId);
  const current = resolveHomeLayout(organization.id, organization.name);
  const next: HomeLayout = {
    ...current,
    homeSlotOrder: normalizeHomeSlotOrder(order),
    updatedAt: now(),
  };
  return saveHomeLayout(organization.id, next);
}

export function addOrgHomeImages(
  organizationId: string | null | undefined,
  filenames: string[],
  cardId?: string | null
) {
  const organization = requireOrg(organizationId);
  const current = resolveHomeLayout(organization.id, organization.name);
  const room = MAX_IMAGES - countImages(current.cards);
  if (room <= 0) throw new AppError('You can add up to 5 images across all cards', 400);
  const accepted = filenames.slice(0, room);
  for (const extra of filenames.slice(room)) unlinkUpload(extra);
  if (!accepted.length) throw new AppError('Choose an image to upload', 400);

  const added: HomeImageBlock[] = accepted.map((file) => ({
    id: randomUUID(),
    kind: 'image',
    source: 'upload',
    file,
    url: '',
    enabled: true,
    spaceTop: 0,
    spaceBottom: 0,
  }));

  let targetId = cardId || current.cards[0]?.id;
  let cards = [...current.cards];
  if (!targetId || !cards.some((card) => card.id === targetId)) {
    const fresh = makeCard([]);
    cards = [...cards, fresh];
    targetId = fresh.id;
  }

  cards = cards.map((card) =>
    card.id === targetId ? { ...card, blocks: [...card.blocks, ...added] } : card
  );

  const next: HomeLayout = {
    ...current,
    cards,
    updatedAt: now(),
  };
  return saveHomeLayout(organization.id, next);
}

export function deleteOrgHomeImage(organizationId: string | null | undefined, imageId: string) {
  const organization = requireOrg(organizationId);
  const current = resolveHomeLayout(organization.id, organization.name);
  const target = imageBlocks(current.cards).find((item) => item.id === imageId);
  if (!target) throw new AppError('Image not found', 404);
  if (isUploadImage(target) && target.file) unlinkUpload(target.file);
  const next: HomeLayout = {
    ...current,
    cards: current.cards.map((card) => ({
      ...card,
      blocks: card.blocks.filter((item) => item.id !== imageId),
    })),
    updatedAt: now(),
  };
  return saveHomeLayout(organization.id, next);
}

export function toPublicHomeLayout(organizationId: string, organizationName: string) {
  const layout = resolveHomeLayout(organizationId, organizationName);
  return {
    bgTheme: layout.bgTheme || 'default',
    meetingBoardEnabled: Boolean(layout.meetingBoardEnabled),
    homeSlotOrder: normalizeHomeSlotOrder(layout.homeSlotOrder),
    cards: layout.cards
      .filter((card) => card.enabled !== false)
      .map((card) => ({
        id: card.id,
        frame: normalizeCardFrame(card.frame),
        blocks: card.blocks
          .filter((block) => block.enabled !== false)
          .map((block) => {
            if (block.kind === 'image') {
              const source = isUrlImage(block) ? ('url' as const) : ('upload' as const);
              return {
                id: block.id,
                kind: 'image' as const,
                source,
                file: source === 'upload' ? block.file : '',
                url: source === 'url' ? block.url : '',
                spaceTop: clampSpace(block.spaceTop),
                spaceBottom: clampSpace(block.spaceBottom),
              };
            }
            if (block.kind === 'links') {
              return {
                id: block.id,
                kind: 'links' as const,
                iconStyle: block.iconStyle,
                spaceTop: clampSpace(block.spaceTop, 8),
                spaceBottom: clampSpace(block.spaceBottom, 8),
                items: block.items
                  .filter((item) => item.enabled !== false && item.url)
                  .slice(0, MAX_LINKS)
                  .map((item) => ({
                    id: item.id,
                    platform: item.platform,
                    url: item.url,
                    label: item.label,
                  })),
              };
            }
            return {
              id: block.id,
              kind: block.kind,
              text: block.text,
              style: block.style,
              spaceTop: clampSpace(block.spaceTop),
              spaceBottom: clampSpace(block.spaceBottom),
            };
          })
          .filter((block) => {
            if (block.kind === 'image') {
              return Boolean(block.source === 'url' ? block.url : block.file);
            }
            if (block.kind === 'links') return block.items.length > 0;
            return Boolean(block.text?.trim());
          }),
      }))
      .filter((card) => card.blocks.length > 0),
  };
}
