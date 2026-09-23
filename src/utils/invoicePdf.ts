import type { Response } from 'express';
import type { OrgSubscription } from '../data/subscriptionStore';
import type { StoredOrganization, StoredUser } from '../types/auth';

// pdfkit ships without bundled TypeScript types
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const PDFDocument = require('pdfkit') as any;

/** Dashboard CTA / primary brand color */
const PRIMARY = '#111827';
const PRIMARY_DEEP = '#030712';
const MUTE = '#6b7280';
const LINE = '#e5e7eb';
const SOFT = '#f3f4f6';
const SUCCESS_BG = '#dcfce7';
const SUCCESS = '#166534';
const WHITE = '#ffffff';

function formatInDate(iso: string, withTime = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  if (withTime) {
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function money(amount: number) {
  return `Rs ${amount.toLocaleString('en-IN')}`;
}

function roundedRect(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string
) {
  doc.save();
  doc.roundedRect(x, y, w, h, r);
  if (fill) {
    doc.fillColor(fill).fill();
  }
  if (stroke) {
    doc.roundedRect(x, y, w, h, r).strokeColor(stroke).lineWidth(0.8).stroke();
  }
  doc.restore();
}

export function streamVisitHubInvoicePdf(
  res: Response,
  input: {
    sub: OrgSubscription;
    org: StoredOrganization | null | undefined;
    admin: StoredUser | null | undefined;
    supportEmail?: string;
    supportWebsite?: string;
  }
) {
  const { sub, org, admin } = input;
  const supportEmail = (input.supportEmail || 'support@visithub.in').trim();
  const supportWebsite = (input.supportWebsite || 'www.visithub.in').trim();
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sub.invoiceNumber}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const left = 40;
  const right = pageW - 40;
  const contentW = right - left;

  // ── Header ──
  let y = 42;

  // VH logo square
  roundedRect(doc, left, y, 36, 36, 8, PRIMARY);
  doc
    .fillColor(WHITE)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('VH', left, y + 11, { width: 36, align: 'center' });

  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('Visit Hub', left + 46, y + 4);
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(9)
    .text('Smarter Visits. Safer Spaces.', left + 46, y + 24);

  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('INVOICE', left, y, { width: contentW, align: 'right' });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(10)
    .text('Subscription Invoice', left, y + 26, { width: contentW, align: 'right' });

  // PAID badge
  const paidLabel = 'PAID';
  const badgeW = 58;
  const badgeX = right - badgeW;
  const badgeY = y + 42;
  roundedRect(doc, badgeX, badgeY, badgeW, 18, 9, SUCCESS_BG);
  doc
    .fillColor(SUCCESS)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(paidLabel, badgeX, badgeY + 4, { width: badgeW, align: 'center' });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(8)
    .text('Payment Received', left, badgeY + 22, { width: contentW, align: 'right' });

  y = badgeY + 48;

  // Divider
  doc
    .moveTo(left, y)
    .lineTo(right, y)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();
  y += 18;

  // ── Bill to + meta ──
  const billW = contentW * 0.48;
  const metaX = left + contentW * 0.52;
  const billH = 92;

  roundedRect(doc, left, y, billW, billH, 10, SOFT);
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(9)
    .text('Bill to', left + 14, y + 12);
  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(org?.name || 'Organisation', left + 14, y + 28, { width: billW - 28 });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(9)
    .text(org?.email || admin?.email || '—', left + 14, y + 50, { width: billW - 28 });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(9)
    .text(`Admin: ${admin?.fullName || '—'}`, left + 14, y + 66, { width: billW - 28 });

  const metaRows: [string, string][] = [
    ['Invoice No.', sub.invoiceNumber],
    ['Payment Date', formatInDate(sub.paidAt, true)],
    ['Payment Method', 'Dummy (gateway pending)'],
    ['Invoice Date', formatInDate(sub.paidAt, false)],
    ['Status', 'Paid'],
  ];

  let metaY = y + 8;
  for (const [label, value] of metaRows) {
    doc
      .fillColor(MUTE)
      .font('Helvetica')
      .fontSize(8)
      .text(label, metaX, metaY, { width: 90 });
    doc
      .fillColor(PRIMARY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(value, metaX + 92, metaY, { width: contentW * 0.48 - 92 });
    metaY += 16;
  }

  y += Math.max(billH, metaRows.length * 16 + 16) + 22;

  // ── Subscription details ──
  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Subscription Details', left, y);
  y += 16;
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(9)
    .text('Here are the details of your subscription with Visit Hub.', left, y);
  y += 18;

  // Table header
  const col = {
    hash: left,
    desc: left + 28,
    dur: left + 220,
    from: left + 290,
    until: left + 380,
    amount: left + 470,
  };
  const rowH = 28;
  roundedRect(doc, left, y, contentW, rowH, 6, SOFT);
  doc.fillColor(MUTE).font('Helvetica-Bold').fontSize(8);
  const headY = y + 10;
  doc.text('#', col.hash + 8, headY);
  doc.text('Description', col.desc, headY);
  doc.text('Duration', col.dur, headY);
  doc.text('Valid From', col.from, headY);
  doc.text('Valid Until', col.until, headY);
  doc.text('Amount', col.amount, headY, { width: right - col.amount - 8, align: 'right' });
  y += rowH + 4;

  // Table body
  const bodyTop = y;
  const bodyH = 48;
  doc
    .roundedRect(left, bodyTop, contentW, bodyH, 6)
    .strokeColor(LINE)
    .lineWidth(0.8)
    .stroke();

  const duration = `${sub.months} month${sub.months === 1 ? '' : 's'}`;
  const planTitle = `Visit Hub – ${sub.planName}`;
  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('1', col.hash + 8, bodyTop + 12);
  doc.text(planTitle, col.desc, bodyTop + 10, { width: 180 });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(8)
    .text('Access to all standard features', col.desc, bodyTop + 24, { width: 180 });

  doc
    .fillColor(PRIMARY)
    .font('Helvetica')
    .fontSize(8)
    .text(duration, col.dur, bodyTop + 16, { width: 60 })
    .text(formatInDate(sub.startsAt, false), col.from, bodyTop + 16, { width: 80 })
    .text(formatInDate(sub.endsAt, false), col.until, bodyTop + 16, { width: 80 });
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(money(sub.priceInr), col.amount, bodyTop + 16, {
      width: right - col.amount - 8,
      align: 'right',
    });

  y = bodyTop + bodyH + 16;

  // Total box
  const totalW = 240;
  const totalH = 52;
  const totalX = right - totalW;
  roundedRect(doc, totalX, y, totalW, totalH, 10, SOFT);
  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Total Amount Paid', totalX + 14, y + 12);
  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(money(sub.priceInr), totalX + 14, y + 28, { width: totalW - 28, align: 'right' });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(7)
    .text('(Inclusive of all taxes)', totalX + 14, y + 28, { width: 110 });

  y += totalH + 28;

  // Help box
  const helpH = 56;
  roundedRect(doc, left, y, contentW, helpH, 10, SOFT);
  // info circle
  doc.circle(left + 22, y + helpH / 2, 9).fillColor(PRIMARY).fill();
  doc
    .fillColor(WHITE)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('i', left + 19, y + helpH / 2 - 4);

  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Need Help?', left + 40, y + 12);
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(8)
    .text(
      'If you have any questions about this invoice or your subscription, feel free to contact our support team.',
      left + 40,
      y + 26,
      { width: contentW * 0.55 }
    );
  doc
    .fillColor(PRIMARY)
    .font('Helvetica')
    .fontSize(8)
    .text(supportEmail, left + contentW * 0.62, y + 18, {
      width: contentW * 0.35,
      align: 'right',
    })
    .text(supportWebsite, left + contentW * 0.62, y + 32, {
      width: contentW * 0.35,
      align: 'right',
    });

  y += helpH + 30;

  // Footer
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(8)
    .text(
      'Thank you for choosing Visit Hub. Together, we make workplaces, schools and organisations safer.',
      left,
      y,
      { width: contentW * 0.58 }
    );

  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Oblique')
    .fontSize(14)
    .text('Team Visit Hub', left, y, { width: contentW, align: 'right' });
  doc
    .fillColor(MUTE)
    .font('Helvetica')
    .fontSize(7)
    .text('VISIT HUB', left, y + 20, { width: contentW, align: 'right' })
    .text('SMARTER VISITS. SAFER SPACES.', left, y + 30, { width: contentW, align: 'right' });

  // Bottom brand strip
  const stripY = doc.page.height - 28;
  doc.rect(0, stripY, pageW, 28).fillColor(PRIMARY_DEEP).fill();
  doc
    .fillColor(WHITE)
    .font('Helvetica')
    .fontSize(8)
    .text('Visit Hub  ·  Subscription Invoice', 0, stripY + 10, {
      width: pageW,
      align: 'center',
    });

  doc.end();
}
