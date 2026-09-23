export type AuthRole = 'super_admin' | 'org_admin' | 'staff';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthRole;
  organizationId: string | null;
  staffRoleId?: string | null;
  staffCode?: string | null;
  /** Staff-only: which org dashboard pages they can open. Org admin always has all. */
  allowedPages?: string[];
};

export type StoredUser = AuthUser & {
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  supabaseId?: string | null;
};

export type StoredOrganization = {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  contactNumber: string;
  email: string;
  website: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  adminUserId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  logoFile?: string | null;
  welcomeImageFile?: string | null;
  workingDays?: string[] | null;
  openingTime?: string | null;
  closingTime?: string | null;
  defaultWaitMinutes?: number | null;
  /** Show “Review on Google” CTA for visitors on Home */
  googleReviewEnabled?: boolean;
  /** Direct Google Review / Maps link visitors open */
  googleReviewUrl?: string | null;
};

export type StoredStaffRole = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffSummary = {
  organizationId: string;
  totalStaff: number;
  totalRoles: number;
  totalActive: number;
  updatedAt: string;
};

export type StoredQrCode = {
  id: string;
  organizationId: string;
  label: string;
  publicCode: string;
  createdAt: string;
};

export type StoredVisitor = {
  id: string;
  organizationId: string;
  qrCodeId: string;
  publicCode: string;
  label: string;
  date: string | null;
  visitorName: string | null;
  email: string | null;
  googleSub?: string | null;
  mobileNumber: string | null;
  addressCompany: string | null;
  personToMeet: string | null;
  department: string | null;
  purpose: string | null;
  vehicleNumber: string | null;
  inTime: string | null;
  outTime: string | null;
  signatureFile: string | null;
  remarks: string | null;
  aadhaarFrontFile: string | null;
  aadhaarBackFile: string | null;
  selfieFile: string | null;
  customValues?: Record<string, string>;
  visitorUid: string;
  outLabel: string | null;
  outPublicCode: string | null;
  outQrCodeId: string | null;
  ticketStatus?: 'waiting' | 'confirmed' | 'closed' | 'declined';
  waitMinutes?: number | null;
  waitStartedAt?: string | null;
  waitEndsAt?: string | null;
  waitSource?: 'default' | 'manual' | null;
  outPhotoFile?: string | null;
  closedByUserId?: string | null;
  closedByName?: string | null;
  closedByRole?: string | null;
  closeType?: 'checkout' | 'force' | 'auto' | null;
  closedAt?: string | null;
  rating?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomVisitorField = {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'textarea' | 'number' | 'alpha' | 'mix' | 'upload' | 'photo';
  stage?: 'checkin' | 'checkout';
};

export type MeetingAvailability = 'yes' | 'no' | null;

export type StoredMeetingPerson = {
  name: string;
  status: MeetingAvailability;
};

export type StoredMeetingDay = {
  organizationId: string;
  date: string;
  people: Record<string, StoredMeetingPerson>;
};

export type StoredPushSubscription = {
  visitorId: string;
  organizationId: string;
  publicCode: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  updatedAt: string;
};

export type VisitorFieldSettings = {
  show: Record<string, boolean>;
  labels: Record<string, string>;
  custom: CustomVisitorField[];
  order?: string[];
  required?: Record<string, boolean>;
  continueWith?: { google: boolean; number: boolean };
};

export type HomeTextStyle = {
  fontSize: number;
  fontWeight: 'normal' | 'semibold' | 'bold';
  fontStyle: 'normal' | 'italic';
  fontFamily: string;
  color: string;
  align: 'left' | 'center' | 'right';
  rotate: number;
  curve: 'none' | 'up' | 'down';
  decoration: 'none' | 'underline' | 'line-through';
  letterSpacing: number;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
};

export type HomeTextKind = 'heading' | 'subtitle' | 'paragraph';

export type HomeLinkPlatform =
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'youtube'
  | 'linkedin'
  | 'twitter'
  | 'x'
  | 'custom';

export type HomeLinkIconStyle = 'filled' | 'outline' | 'soft' | 'minimal';

export type HomeTextBlock = {
  id: string;
  kind: HomeTextKind;
  enabled: boolean;
  text: string;
  style: HomeTextStyle;
  spaceTop: number;
  spaceBottom: number;
  /** Max words allowed in this text block */
  maxWords: number;
};

export type HomeImageBlock = {
  id: string;
  kind: 'image';
  enabled: boolean;
  source: 'upload' | 'url';
  file: string;
  url: string;
  spaceTop: number;
  spaceBottom: number;
};

export type HomeLinkItem = {
  id: string;
  platform: HomeLinkPlatform;
  url: string;
  label: string;
  enabled: boolean;
};

export type HomeLinksBlock = {
  id: string;
  kind: 'links';
  enabled: boolean;
  iconStyle: HomeLinkIconStyle;
  items: HomeLinkItem[];
  spaceTop: number;
  spaceBottom: number;
};

export type HomeBlock = HomeTextBlock | HomeImageBlock | HomeLinksBlock;

export type HomeCard = {
  id: string;
  enabled: boolean;
  /** card = soft; round = more curve; circle = pill; plain = no chrome */
  frame: 'card' | 'round' | 'circle' | 'plain';
  blocks: HomeBlock[];
};

/** @deprecated legacy shape kept for store migration */
export type HomeImage = {
  id: string;
  file: string;
  enabled: boolean;
};

/** Order of Home sections on visitor Home (admin rearrange) */
export type HomeSlotId = 'meetingBoard' | 'googleReview' | 'cards';

export type HomeLayout = {
  cards: HomeCard[];
  /** Default visitor Home BG theme from dashboard */
  bgTheme: string;
  /** Show person-to-meet availability notice board on visitor Home */
  meetingBoardEnabled?: boolean;
  /** Visitor Home section order — admin can move up/down */
  homeSlotOrder?: HomeSlotId[];
  /** One-time: default arched headings flattened to straight */
  straightCurvesV1?: boolean;
  updatedAt: string;
};

export type StoreIndexes = {
  userByEmail: Record<string, string>;
  userById: Record<string, string>;
  staffByOrgPhone: Record<string, string>;
  staffByOrgName: Record<string, string>;
  staffByOrgCode: Record<string, string>;
  roleByOrgCode: Record<string, string>;
  roleByOrgName: Record<string, string>;
  staffIdsByOrg: Record<string, string[]>;
  staffIdsByOrgRole: Record<string, string[]>;
  roleIdsByOrg: Record<string, string[]>;
  visitorById: Record<string, string>;
  visitorIdsByOrg: Record<string, string[]>;
  visitorIdsByQr: Record<string, string[]>;
  visitorIdsByOrgMobile: Record<string, string[]>;
  visitorIdsByOrgUid: Record<string, string[]>;
  visitorIdsByOrgEmail: Record<string, string[]>;
};
