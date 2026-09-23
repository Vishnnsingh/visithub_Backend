export interface Table {
  id: string;
  restaurantId: string;
  tableNumber: string;
  qrToken: string;
  qrImageUrl: string;
  capacity: number;
  isOccupied: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TableModel = {
  table: 'tables',
} as const;
