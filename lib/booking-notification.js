const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_RECIPIENT = 'karebykari@gmail.com';
const DEFAULT_SENDER = 'Kare By Kari <onboarding@resend.dev>';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function displayDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return String(value || '');
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function bookingDates(booking) {
  return booking.startDate === booking.endDate
    ? displayDate(booking.startDate)
    : `${displayDate(booking.startDate)} – ${displayDate(booking.endDate)}`;
}

function buildEmail(booking) {
  const dates = bookingDates(booking);
  const bookingNumber = booking.id.slice(0, 8).toUpperCase();
  const ownerPage = 'https://dog-sitting-zeta.vercel.app/admin.html';
  const subject = `New booking: ${booking.dogName} — ${dates}`;
  const optionalRows = [
    booking.phone && ['Phone', booking.phone],
    booking.dogBreed && ['Breed & size', booking.dogBreed],
    booking.notes && ['Notes', booking.notes],
  ].filter(Boolean);
  const rows = [
    ['Booking number', bookingNumber],
    ['Dates', dates],
    ['Service', booking.service],
    ['Customer', booking.ownerName],
    ['Email', booking.email],
    ...optionalRows,
  ];

  const text = [
    'A new Kare By Kari booking was received.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Review the booking: ${ownerPage}`,
  ].join('\n');

  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <th style="padding:8px 14px 8px 0;text-align:left;vertical-align:top;color:#684123;">${escapeHtml(label)}</th>
      <td style="padding:8px 0;color:#4b3a2d;white-space:pre-wrap;">${escapeHtml(value)}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#4b3a2d;">
      <h1 style="color:#684123;margin:0 0 8px;">New Kare By Kari booking</h1>
      <p style="margin:0 0 20px;">${escapeHtml(booking.ownerName)} booked care for ${escapeHtml(booking.dogName)}.</p>
      <table style="border-collapse:collapse;width:100%;">${htmlRows}</table>
      <p style="margin:24px 0 0;">
        <a href="${ownerPage}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#684123;color:#fff;text-decoration:none;font-weight:bold;">Open Owner Calendar</a>
      </p>
    </div>`;

  return { subject, text, html };
}

async function sendBookingNotification(booking) {
  const apiKey = process.env.RESEND_API_KEY || '';
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  const message = buildEmail(booking);
  const result = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `booking-${booking.id}`,
      'User-Agent': 'kare-by-kari-booking/1.0',
    },
    body: JSON.stringify({
      from: process.env.BOOKING_FROM_EMAIL || DEFAULT_SENDER,
      to: [process.env.BOOKING_NOTIFICATION_EMAIL || DEFAULT_RECIPIENT],
      reply_to: booking.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  const payload = await result.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(payload.message || `Email service returned ${result.status}.`);
  }

  return { sent: true, id: payload.id };
}

module.exports = {
  buildEmail,
  sendBookingNotification,
};
