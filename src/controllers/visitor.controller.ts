import type { Request } from 'express';
import { successResponse } from '../utils/apiResponse';
import asyncHandler from '../utils/asyncHandler';
import AppError from '../utils/AppError';
import {
  addMeetingPersonName,
  removeMeetingPersonName,
  checkInVisitor,
  checkOutVisitor,
  getAdminFields,
  getAdminVisitorDetail,
  getOrgVisitorDashboard,
  getPublicEntry,
  getPublicOrgHome,
  getPublicVisit,
  listAdminVisitors,
  listPublicHistory,
  listTickets,
  listTodayMeetings,
  listMeetingsMonth,
  recognizeVisitor,
  registerVisitor,
  resumeGoogleVisitor,
  resumeDbGoogleVisitor,
  applyWaitMinutesToAllOpenVisitors,
  saveDefaultWaitMinutes,
  saveMeetingStatus,
  saveVisitorRating,
  saveVisitorSelfie,
  saveVisitorPush,
  signInGoogleVisitor,
  startPhoneVisitor,
  updateAdminFields,
  updateTicket,
} from '../services/visitor.service';

function orgId(req: Request): string {
  if (!req.user?.organizationId) throw new AppError('Organisation context is required', 403);
  return req.user.organizationId;
}

function files(req: Request) {
  const raw = req.files;
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const next: Record<string, Express.Multer.File[]> = {};
    for (const file of raw) {
      (next[file.fieldname] ||= []).push(file);
    }
    return next;
  }
  return raw as Record<string, Express.Multer.File[]>;
}

export const getVisitorFields = asyncHandler(async (req, res) => {
  return successResponse(res, 'Active fields loaded', getAdminFields(orgId(req)));
});

export const saveVisitorFields = asyncHandler(async (req, res) => {
  return successResponse(res, 'Active fields saved', updateAdminFields(orgId(req), req.body.fields, req.body.continueWith));
});

export const getVisitorDetails = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Visitor details loaded',
    listAdminVisitors(
      orgId(req),
      String(req.query.range || 'today'),
      Number(req.query.page || 1),
      Number(req.query.limit || 10),
      {
        date: String(req.query.date || ''),
        personToMeet: String(req.query.personToMeet || ''),
        gate: String(req.query.gate || ''),
      }
    )
  );
});

export const getVisitorDetail = asyncHandler(async (req, res) => {
  return successResponse(res, 'Visitor loaded', getAdminVisitorDetail(orgId(req), String(req.params.id)));
});

export const getVisitorDashboard = asyncHandler(async (req, res) => {
  return successResponse(res, 'Dashboard loaded', getOrgVisitorDashboard(orgId(req)));
});

export const getMeetings = asyncHandler(async (req, res) => {
  const month = String(req.query.month || '').trim();
  if (month) {
    return successResponse(res, 'Meetings loaded', listMeetingsMonth(orgId(req), month));
  }
  const date = String(req.query.date || '').trim();
  return successResponse(res, 'Meetings loaded', listTodayMeetings(orgId(req), date || undefined));
});

export const saveMeeting = asyncHandler(async (req, res) => {
  const raw = String(req.body.status || '');
  const status = raw === 'soon' ? null : raw === 'yes' || raw === 'no' ? raw : null;
  if (raw !== 'soon' && raw !== 'yes' && raw !== 'no') throw new AppError('Invalid availability', 400);
  const date = String(req.body.date || '').trim();
  return successResponse(
    res,
    'Availability updated',
    saveMeetingStatus(orgId(req), String(req.body.name || ''), status, date || undefined)
  );
});

export const addMeeting = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Meeting person added',
    addMeetingPersonName(orgId(req), String(req.body.name || ''))
  );
});

export const removeMeeting = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Meeting person removed',
    removeMeetingPersonName(orgId(req), String(req.body.name || req.query.name || ''))
  );
});

export const getTickets = asyncHandler(async (req, res) => {
  const day = String(req.query.day || 'today') === 'yesterday' ? 'yesterday' : 'today';
  return successResponse(
    res,
    'Tickets loaded',
    listTickets(
      orgId(req),
      String(req.query.status || 'all'),
      Number(req.query.page || 1),
      Number(req.query.limit || 10),
      day
    )
  );
});

export const saveTicket = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Ticket updated',
    updateTicket(orgId(req), String(req.params.id), req.body.action, Number(req.body.minutes || 0), req.user)
  );
});

export const saveTicketSettings = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Set counter timer saved',
    saveDefaultWaitMinutes(orgId(req), req.body.defaultWaitMinutes === null ? null : Number(req.body.defaultWaitMinutes))
  );
});

export const applyTicketWaitAll = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Timer applied to all open visitors',
    applyWaitMinutesToAllOpenVisitors(
      orgId(req),
      req.body.waitMinutes === null ? null : Number(req.body.waitMinutes)
    )
  );
});

export const getQrVisit = asyncHandler(async (req, res) => {
  return successResponse(res, 'Visit loaded', getPublicVisit(String(req.params.code)));
});

export const getPublicOrgHomePage = asyncHandler(async (req, res) => {
  return successResponse(res, 'Organisation home loaded', getPublicOrgHome(String(req.params.organizationId)));
});

export const registerQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Details filled successfully',
    registerVisitor(String(req.params.code), req.body as Record<string, unknown>, files(req)),
    201
  );
});

export const getQrVisitEntry = asyncHandler(async (req, res) => {
  return successResponse(res, 'Visitor details loaded', getPublicEntry(String(req.params.code), String(req.params.visitorId)));
});

export const getQrVisitHistory = asyncHandler(async (req, res) => {
  return successResponse(res, 'History loaded', listPublicHistory(String(req.params.code), String(req.params.visitorId)));
});

export const saveQrVisitPush = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Notifications connected',
    saveVisitorPush(String(req.params.code), String(req.params.visitorId), req.body)
  );
});

export const saveQrVisitSelfie = asyncHandler(async (req, res) => {
  if (!req.file?.filename) throw new AppError('Take a selfie first', 400);
  const maxBytes = 5 * 1024 * 1024;
  if (req.file.size > maxBytes) {
    throw new AppError('Selfie must be 5 MB or smaller', 400);
  }
  return successResponse(
    res,
    'Selfie saved',
    saveVisitorSelfie(String(req.params.code), String(req.params.visitorId), req.file.filename)
  );
});

export const googleQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Google account connected',
    await signInGoogleVisitor(String(req.params.code), String(req.body.credential || ''))
  );
});

export const resumeGoogleQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Google session resumed',
    resumeGoogleVisitor(String(req.params.code), String(req.body.email || ''), String(req.body.googleToken || ''))
  );
});

export const resumeDbGoogleQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Google session resumed',
    resumeDbGoogleVisitor(String(req.params.code), String(req.body.email || ''))
  );
});

export const startPhoneQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Continue with number',
    startPhoneVisitor(String(req.params.code), String(req.body.mobileNumber || ''))
  );
});

export const recognizeQrVisit = asyncHandler(async (req, res) => {
  return successResponse(res, 'Visit recognised', recognizeVisitor(String(req.params.code), String(req.query.uid || '')));
});

export const checkInQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Checked in',
    checkInVisitor(String(req.params.code), String(req.body.visitorUid || '')),
    201
  );
});

export const checkOutQrVisit = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Out time saved',
    checkOutVisitor(String(req.params.code), String(req.params.visitorId), String(req.body.outPublicCode || ''))
  );
});

export const saveQrVisitRating = asyncHandler(async (req, res) => {
  return successResponse(
    res,
    'Rating saved',
    saveVisitorRating(String(req.params.code), String(req.params.visitorId), Number(req.body.rating))
  );
});

export const meetingOutQrVisit = asyncHandler(async (req, res) => {
  const uploaded = files(req);
  const customValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    if (key.startsWith('c_') && typeof value === 'string' && value.trim()) customValues[key] = value.trim();
  }
  for (const [key, list] of Object.entries(uploaded)) {
    if (key.startsWith('c_') && list?.[0]?.filename) customValues[key] = list[0].filename;
  }
  return successResponse(
    res,
    'Out time saved',
    checkOutVisitor(String(req.params.code), String(req.params.visitorId), String(req.body.outPublicCode || ''), {
      remarks: String(req.body.remarks || ''),
      signatureFile: uploaded.signature?.[0]?.filename,
      outPhotoFile: uploaded.outPhoto?.[0]?.filename,
      requireMeetingFields: true,
      customValues,
    })
  );
});
