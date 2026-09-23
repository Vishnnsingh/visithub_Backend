export type VisitNotice = {
  title: string;
  body: string;
  kind: 'timer' | 'status';
};

export function vapidPublicKey() {
  return null;
}

export async function sendVisitorPush(_visitorId: string, _publicCode: string, _notice: VisitNotice) {
  return;
}
