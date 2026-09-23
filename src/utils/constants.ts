export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled',
});

export const USER_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  RESTAURANT_ADMIN: 'restaurant_admin',
  STAFF: 'staff',
  KITCHEN: 'kitchen',
  CUSTOMER: 'customer',
});

export const ORG_WORKSPACE_ROLES = [USER_ROLES.ORG_ADMIN, USER_ROLES.STAFF] as const;

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const BUSINESS_TYPES = [
  'School',
  'College',
  'Company/Office',
  'PG',
  'Hostel',
  'Apartment/Society',
  'Showroom',
  'Factory',
  'Hospital',
  'Hotel',
  'Other',
] as const;

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type IndianState = (typeof INDIAN_STATES)[number];
