import {
  backfillPaymentsFromSubscriptions,
  getPaymentById,
  getPaymentGatewaySettings,
  getPaymentStats,
  listPayments,
  setPaymentGatewaySettings,
  type PaymentGateway,
} from '../data/paymentLedgerStore';
import { listAllSubscriptions } from '../data/subscriptionStore';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';

function syncLedgerFromSubscriptions() {
  backfillPaymentsFromSubscriptions(listAllSubscriptions());
}

export const adminPaymentStats = asyncHandler(async (_req, res) => {
  syncLedgerFromSubscriptions();
  return successResponse(res, 'Payment stats', getPaymentStats());
});

export const adminListPayments = asyncHandler(async (req, res) => {
  syncLedgerFromSubscriptions();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const periodRaw = String(req.query.period || 'all');
  const period =
    periodRaw === 'day' || periodRaw === 'month' || periodRaw === 'all' ? periodRaw : 'all';
  return successResponse(res, 'Payments', listPayments({ page, limit, period }));
});

export const adminPaymentDetail = asyncHandler(async (req, res) => {
  syncLedgerFromSubscriptions();
  const id = String(req.params.id || '');
  const row = getPaymentById(id);
  if (!row) throw new AppError('Payment not found', 404);
  return successResponse(res, 'Payment detail', row);
});

export const adminGetPaymentSettings = asyncHandler(async (_req, res) => {
  return successResponse(res, 'Payment gateway settings', getPaymentGatewaySettings());
});

export const adminUpdatePaymentSettings = asyncHandler(async (req, res) => {
  const body = req.body as { feePercent?: number; gateway?: PaymentGateway };
  try {
    const saved = setPaymentGatewaySettings(body);
    return successResponse(res, 'Payment gateway settings updated', saved);
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : 'Invalid settings', 400);
  }
});
