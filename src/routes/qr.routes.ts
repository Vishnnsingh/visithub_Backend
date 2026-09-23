import { Router } from 'express';
import {
  generateOrgQrCodes,
  getOrgQrCode,
  listOrgQrCodes,
  removeOrgQrCode,
} from '../controllers/qr.controller';
import {
  getQrVisit,
  getQrVisitEntry,
  getQrVisitHistory,
  googleQrVisit,
  resumeGoogleQrVisit,
  resumeDbGoogleQrVisit,
  startPhoneQrVisit,
  recognizeQrVisit,
  registerQrVisit,
  checkInQrVisit,
  checkOutQrVisit,
  meetingOutQrVisit,
  saveQrVisitRating,
  saveQrVisitSelfie,
  saveQrVisitPush,
} from '../controllers/visitor.controller';
import { authenticate, authorize, requireActiveSubscription, validate, visitorUpload } from '../middleware';
import { ORG_WORKSPACE_ROLES } from '../utils/constants';
import { generateQrSchema } from '../validators/qr.validator';
import { googleResumeSchema, googleReturningSchema, googleSignInSchema, phoneStartSchema, visitorPushSchema, visitorRatingSchema } from '../validators/visitor.validator';

const router = Router();
const visitFiles = visitorUpload.any();
const meetingOutFiles = visitorUpload.any();

router.get('/visit/:code', getQrVisit);
router.get('/visit/:code/recognize', recognizeQrVisit);
router.post('/visit/:code/google', validate(googleSignInSchema), googleQrVisit);
router.post('/visit/:code/google/resume', validate(googleResumeSchema), resumeGoogleQrVisit);
router.post('/visit/:code/google/returning', validate(googleReturningSchema), resumeDbGoogleQrVisit);
router.post('/visit/:code/phone', validate(phoneStartSchema), startPhoneQrVisit);
router.post('/visit/:code/register', visitFiles, registerQrVisit);
router.post('/visit/:code/checkin', checkInQrVisit);
router.post('/visit/:code/out/:visitorId', checkOutQrVisit);
router.post('/visit/:code/meeting-out/:visitorId', meetingOutFiles, meetingOutQrVisit);
router.post('/visit/:code/rating/:visitorId', validate(visitorRatingSchema), saveQrVisitRating);
router.post('/visit/:code/selfie/:visitorId', visitorUpload.single('selfie'), saveQrVisitSelfie);
router.post('/visit/:code/push/:visitorId', validate(visitorPushSchema), saveQrVisitPush);
router.get('/visit/:code/entry/:visitorId', getQrVisitEntry);
router.get('/visit/:code/history/:visitorId', getQrVisitHistory);

router.use(authenticate, authorize(...ORG_WORKSPACE_ROLES), requireActiveSubscription);
router.get('/', listOrgQrCodes);
router.post('/', validate(generateQrSchema), generateOrgQrCodes);
router.get('/:id', getOrgQrCode);
router.delete('/:id', removeOrgQrCode);

export default router;
