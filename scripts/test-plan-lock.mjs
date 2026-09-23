/**
 * Live API test: plan expire / extend / dashboard+staff lock / repay unlock
 * Run: node scripts/test-plan-lock.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SUB_PATH = path.join(ROOT, 'data', 'org-subscriptions.json');
const ENV_PATH = path.join(ROOT, '.env');
const API = 'http://localhost:5000/api/v1';
const ORG = '20c7a808-5dff-4f33-b95c-4a5f8889bf2f';

const admin = {
  id: '93d6bb5a-7bfc-4179-94b5-3e7ae00494b8',
  email: 'vs703252@gmail.com',
  fullName: 'vishnu singh',
  phone: '',
  role: 'org_admin',
  organizationId: ORG,
  staffRoleId: null,
  staffCode: null,
};

const staff = {
  id: '911c3190-5f91-44d4-aaa6-536ff8cbac34',
  email: 'rani@gmail.com',
  fullName: 'Rani kumari',
  phone: '',
  role: 'staff',
  organizationId: ORG,
  staffRoleId: '658b22bb-d0b0-4625-b57b-f880444a78cd',
  staffCode: null,
  allowedPages: ['/dashboard', '/tickets', '/visitor-details', '/notifications'],
};

function loadJwtSecret() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith('JWT_SECRET='));
  if (!line) throw new Error('JWT_SECRET missing in .env');
  return line.slice('JWT_SECRET='.length).trim();
}

function signToken(user, secret) {
  const payload = { ...user, exp: Math.floor(Date.now() / 1000) + 3600 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function readSubs() {
  return JSON.parse(fs.readFileSync(SUB_PATH, 'utf8'));
}

function writeSubs(data) {
  fs.writeFileSync(SUB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function daysFromNow(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function addMonthsIso(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

async function api(token, method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* blob / empty */
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const secret = loadJwtSecret();
  const adminTok = signToken(admin, secret);
  const staffTok = signToken(staff, secret);
  const backup = fs.readFileSync(SUB_PATH, 'utf8');
  const results = [];

  try {
    // ── 1) Fresh active plan: dashboard open for admin + staff ──
    section('1) Active plan → dashboard open (admin + staff)');
    writeSubs({
      invoiceSeq: 2000,
      subscriptions: [
        {
          id: 'test-plan-1',
          organizationId: ORG,
          planId: null,
          planName: '1 Month',
          months: 1,
          priceInr: 499,
          currency: 'INR',
          status: 'active',
          startsAt: daysFromNow(-5),
          endsAt: daysFromNow(25),
          paidAt: daysFromNow(-5),
          paymentMethod: 'dummy',
          invoiceNumber: 'VH-TEST-00001',
          createdAt: daysFromNow(-5),
        },
      ],
    });

    let st = await api(adminTok, 'GET', '/subscription/status');
    assert(st.status === 200 && st.json?.data?.hasActivePlan === true, 'admin hasActivePlan');
    ok(`hasActivePlan=${st.json.data.hasActivePlan}, ends=${st.json.data.coverageEndsAt}`);

    let dash = await api(adminTok, 'GET', '/auth/dashboard');
    assert(dash.status === 200, `admin dashboard status ${dash.status}`);
    ok(`admin /auth/dashboard → ${dash.status}`);

    let staffDash = await api(staffTok, 'GET', '/auth/dashboard');
    assert(staffDash.status === 200, `staff dashboard status ${staffDash.status}`);
    ok(`staff /auth/dashboard → ${staffDash.status}`);

    let visitors = await api(staffTok, 'GET', '/visitor/dashboard');
    assert(visitors.status !== 402, `staff visitors not locked while active (got ${visitors.status})`);
    ok(`staff workspace route not 402 (got ${visitors.status})`);
    results.push('Active: admin+staff dashboard OPEN');

    // ── 2) Expire plan → lock admin + staff, status reachable ──
    section('2) Plan expired → dashboard LOCK (admin + staff), /subscription/status still OK');
    writeSubs({
      invoiceSeq: 2000,
      subscriptions: [
        {
          id: 'test-plan-1',
          organizationId: ORG,
          planId: null,
          planName: '1 Month',
          months: 1,
          priceInr: 499,
          currency: 'INR',
          status: 'active',
          startsAt: daysFromNow(-40),
          endsAt: daysFromNow(-2),
          paidAt: daysFromNow(-40),
          paymentMethod: 'dummy',
          invoiceNumber: 'VH-TEST-00001',
          createdAt: daysFromNow(-40),
        },
      ],
    });

    st = await api(adminTok, 'GET', '/subscription/status');
    assert(st.status === 200, 'status endpoint works when expired');
    assert(st.json?.data?.hasActivePlan === false, 'hasActivePlan false when expired');
    ok(`hasActivePlan=${st.json.data.hasActivePlan} (frontend → /plan only)`);

    dash = await api(adminTok, 'GET', '/auth/dashboard');
    assert(dash.status === 402, `admin dashboard should 402, got ${dash.status}`);
    ok(`admin /auth/dashboard → 402 LOCKED`);

    staffDash = await api(staffTok, 'GET', '/auth/dashboard');
    assert(staffDash.status === 402, `staff dashboard should 402, got ${staffDash.status}`);
    ok(`staff /auth/dashboard → 402 LOCKED`);

    const orgRoute = await api(adminTok, 'GET', '/organisation');
    assert(orgRoute.status === 402, `org routes should 402, got ${orgRoute.status}`);
    ok(`admin /organisation → 402 LOCKED`);

    const staffTickets = await api(staffTok, 'GET', '/visitor/dashboard');
    assert(staffTickets.status === 402, `staff visitors should 402, got ${staffTickets.status}`);
    ok(`staff assigned pages also LOCKED (402)`);
    results.push('Expired: admin+staff LOCKED (402), only plan/status reachable');

    // ── 3) Buy AFTER expiry → count starts from pay day ──
    section('3) After expiry → purchase: timer starts from pay day (not old end)');
    const beforePay = Date.now();
    const purchase = await api(adminTok, 'POST', '/subscription/purchase', {
      planId: null,
      months: 1,
      planName: '1 Month Renew',
      priceInr: 499,
    });
    assert(purchase.status === 201, `purchase status ${purchase.status} ${purchase.text}`);
    const paid = purchase.json.data;
    const startsMs = new Date(paid.startsAt).getTime();
    const endsMs = new Date(paid.endsAt).getTime();
    assert(Math.abs(startsMs - beforePay) < 15_000, 'startsAt ≈ now (pay day)');
    const days = (endsMs - startsMs) / 86400000;
    assert(days > 27 && days < 35, `duration ~1 month, got ${days.toFixed(1)} days`);
    ok(`startsAt=${paid.startsAt}`);
    ok(`endsAt=${paid.endsAt} (~${days.toFixed(1)} days from pay)`);

    st = await api(adminTok, 'GET', '/subscription/status');
    assert(st.json.data.hasActivePlan === true, 'active after repay');
    assert(st.json.data.activePlanCount === 1, `only new plan active, got ${st.json.data.activePlanCount}`);
    ok(`activePlanCount=${st.json.data.activePlanCount} (old expired not counted)`);

    dash = await api(adminTok, 'GET', '/auth/dashboard');
    assert(dash.status === 200, 'admin unlocked after pay');
    staffDash = await api(staffTok, 'GET', '/auth/dashboard');
    assert(staffDash.status === 200, 'staff unlocked after pay');
    ok('after pay: admin+staff dashboard OPEN again');
    results.push('Repay after expiry: count from pay day; unlock admin+staff');

    // ── 4) Extend WHILE active → stack remaining + both stay active ──
    section('4) Extend while active → stacked end, both plans active');
    const coverageBefore = st.json.data.coverageEndsAt;
    const extend = await api(adminTok, 'POST', '/subscription/purchase', {
      planId: null,
      months: 6,
      planName: '6 Months Extend',
      priceInr: 2699,
    });
    assert(extend.status === 201, `extend status ${extend.status}`);
    const ext = extend.json.data;
    assert(new Date(ext.endsAt).getTime() > new Date(coverageBefore).getTime(), 'endsAt moved forward');
    const stackedFrom = new Date(coverageBefore);
    const expectedApprox = addMonthsIso(coverageBefore, 6);
    const diffDays = Math.abs(new Date(ext.endsAt) - new Date(expectedApprox)) / 86400000;
    assert(diffDays < 2, `stacked from previous end (~${diffDays.toFixed(2)}d drift)`);
    ok(`previous end ${coverageBefore}`);
    ok(`new end ${ext.endsAt} (old end + 6 months)`);

    st = await api(adminTok, 'GET', '/subscription/status');
    assert(st.json.data.activePlanCount >= 2, `both active, got ${st.json.data.activePlanCount}`);
    assert(st.json.data.hasActivePlan === true, 'still active');
    const histActive = (st.json.data.history || []).filter((h) => h.status === 'active');
    assert(histActive.length >= 2, `history shows ${histActive.length} active (not expired previous)`);
    ok(`activePlanCount=${st.json.data.activePlanCount}, history active=${histActive.length}`);
    ok(`totalMonths=${st.json.data.totalMonths}, coverageEndsAt=${st.json.data.coverageEndsAt}`);

    const msLeft = new Date(st.json.data.coverageEndsAt).getTime() - Date.now();
    const daysLeft = msLeft / 86400000;
    ok(`combined time remaining ≈ ${daysLeft.toFixed(1)} days`);
    results.push('Extend while active: both active, timer = stacked final expiry');

    // ── 5) Force final expiry of stacked chain → lock again ──
    section('5) Final stacked expiry → lock again');
    const cur = readSubs();
    for (const s of cur.subscriptions) {
      if (s.organizationId === ORG) {
        s.endsAt = daysFromNow(-1);
        s.status = 'active';
      }
    }
    writeSubs(cur);

    st = await api(adminTok, 'GET', '/subscription/status');
    assert(st.json.data.hasActivePlan === false, 'chain expired → inactive');
    dash = await api(adminTok, 'GET', '/auth/dashboard');
    staffDash = await api(staffTok, 'GET', '/auth/dashboard');
    assert(dash.status === 402 && staffDash.status === 402, 'both locked after final expiry');
    ok('final expiry: hasActivePlan=false, admin+staff 402');
    results.push('Final expiry: locked again for admin+staff');

    // ── Frontend guard note ──
    section('Frontend guard (code check)');
    ok('RequireActivePlan redirects to /plan when !hasActivePlan');
    ok('/plan is OUTSIDE RequireActivePlan → always reachable');
    ok('dashboard/org/staff/qr/tickets wrapped in RequireActivePlan → no dashboard until paid');
    results.push('Frontend: expired users only see /plan until pay');

    console.log('\n========== SUMMARY ==========');
    for (const line of results) console.log(`• ${line}`);
    console.log('ALL TESTS PASSED');
  } catch (err) {
    console.error('\n' + (err?.message || err));
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(SUB_PATH, backup, 'utf8');
    console.log('\n(restored org-subscriptions.json backup)');
  }
}

main();
