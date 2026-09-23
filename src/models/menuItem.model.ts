export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  isVeg: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MenuItemModel = {
  table: 'menu_items',
} as const;
