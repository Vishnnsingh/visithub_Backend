export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const RestaurantModel = {
  table: 'restaurants',
} as const;
