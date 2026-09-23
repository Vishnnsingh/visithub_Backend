import { Router } from 'express';
import {
  deleteClosingTime,
  deleteLogo,
  deleteOpeningTime,
  deleteWebsite,
  deleteWelcomeImage,
  deleteWorkingDays,
  getHomeElement,
  getOrgPresence,
  removeHomeElementImage,
  updateClosingTime,
  updateGoogleReview,
  updateHomeElement,
  updateHomeSlotOrder,
  updateLogo,
  updateMeetingBoard,
  updateOpeningTime,
  updateWebsite,
  updateWelcomeImage,
  updateWorkingDays,
  uploadHomeElementImages,
} from '../controllers/org.controller';
import { authenticate, authorize, logoUpload, requireActiveSubscription, validate } from '../middleware';
import { ORG_WORKSPACE_ROLES } from '../utils/constants';
import {
  closingTimeSchema,
  googleReviewSchema,
  homeElementSchema,
  homeSlotOrderSchema,
  meetingBoardSchema,
  openingTimeSchema,
  websiteSchema,
  workingDaysSchema,
} from '../validators/org.validator';

const router = Router();

router.use(authenticate, authorize(...ORG_WORKSPACE_ROLES), requireActiveSubscription);

router.get('/presence', getOrgPresence);
router.put('/presence/website', validate(websiteSchema), updateWebsite);
router.delete('/presence/website', deleteWebsite);
router.put('/presence/google-review', validate(googleReviewSchema), updateGoogleReview);
router.put('/presence/working-days', validate(workingDaysSchema), updateWorkingDays);
router.delete('/presence/working-days', deleteWorkingDays);
router.put('/presence/opening-time', validate(openingTimeSchema), updateOpeningTime);
router.delete('/presence/opening-time', deleteOpeningTime);
router.put('/presence/closing-time', validate(closingTimeSchema), updateClosingTime);
router.delete('/presence/closing-time', deleteClosingTime);
router.put('/presence/logo', logoUpload.single('logo'), updateLogo);
router.delete('/presence/logo', deleteLogo);
router.put('/presence/welcome-image', logoUpload.single('welcomeImage'), updateWelcomeImage);
router.delete('/presence/welcome-image', deleteWelcomeImage);

router.get('/home-element', getHomeElement);
router.put('/home-element', validate(homeElementSchema), updateHomeElement);
router.put('/home-element/meeting-board', validate(meetingBoardSchema), updateMeetingBoard);
router.put('/home-element/slot-order', validate(homeSlotOrderSchema), updateHomeSlotOrder);
router.post('/home-element/images', logoUpload.array('images', 5), uploadHomeElementImages);
router.delete('/home-element/images/:id', removeHomeElementImage);

export default router;
