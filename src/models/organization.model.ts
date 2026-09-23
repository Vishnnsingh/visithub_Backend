export interface Organization {
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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const OrganizationModel = {
  table: 'organizations',
} as const;
