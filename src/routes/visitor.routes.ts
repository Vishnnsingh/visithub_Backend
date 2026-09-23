import { Router } from 'express';
import {
  addMeeting,
  getMeetings,
  getTickets,
  getVisitorDashboard,
  getVisitorDetail,
  getVisitorDetails,
  getVisitorFields,
  removeMeeting,
  saveMeeting,
  saveTicket,
  saveTicketSettings,
  applyTicketWaitAll,
  saveVisitorFields,
} from '../controllers/visitor.controller';
import { authenticate, authorize, requireActiveSubscription, validate } from '../middleware';
import { ORG_WORKSPACE_ROLES } from '../utils/constants';
import {
  meetingPersonSchema,
  meetingStatusSchema,
  ticketActionSchema,
  ticketSettingsSchema,
  ticketWaitAllSchema,
  visitorFieldsSchema,
} from '../validators/visitor.validator';

const router = Router();

router.use(authenticate, authorize(...ORG_WORKSPACE_ROLES), requireActiveSubscription);
router.get('/fields', getVisitorFields);
router.put('/fields', validate(visitorFieldsSchema), saveVisitorFields);
router.get('/details', getVisitorDetails);
router.get('/details/:id', getVisitorDetail);
router.get('/dashboard', getVisitorDashboard);
router.get('/meetings', getMeetings);
router.post('/meetings', validate(meetingPersonSchema), addMeeting);
router.delete('/meetings', validate(meetingPersonSchema), removeMeeting);
router.put('/meetings', validate(meetingStatusSchema), saveMeeting);
router.get('/tickets', getTickets);
router.put('/tickets/settings', validate(ticketSettingsSchema), saveTicketSettings);
router.put('/tickets/wait-all', validate(ticketWaitAllSchema), applyTicketWaitAll);
router.put('/tickets/:id', validate(ticketActionSchema), saveTicket);

export default router;
