import type { OrderStatus } from '../utils/constants';

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  customerName: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const OrderModel = {
  table: 'orders',
} as const;
