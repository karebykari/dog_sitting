const assert = require('assert');
const {
  buildEmail,
  sendBookingNotification,
} = require('../lib/booking-notification');

const booking = {
  id: '12345678-abcd-efgh-ijkl-123456789012',
  ownerName: 'Rama & Ramya',
  email: 'customer@example.com',
  phone: '484-555-0100',
  dogName: 'Rocky',
  dogBreed: 'Beagle, 30 lbs',
  service: 'Overnight Boarding',
  startDate: '2026-08-10',
  endDate: '2026-08-12',
  notes: 'No chicken <please>',
};

async function run() {
  const message = buildEmail(booking);
  assert.match(message.subject, /Rocky/);
  assert.match(message.text, /August 10, 2026 – August 12, 2026/);
  assert.match(message.html, /No chicken &lt;please&gt;/);

  delete process.env.RESEND_API_KEY;
  assert.deepStrictEqual(
    await sendBookingNotification(booking),
    { sent: false, reason: 'not_configured' },
  );

  process.env.RESEND_API_KEY = 're_test';
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: 'email_123' }) };
  };

  try {
    const result = await sendBookingNotification(booking);
    assert.deepStrictEqual(result, { sent: true, id: 'email_123' });
    assert.strictEqual(request.url, 'https://api.resend.com/emails');
    assert.strictEqual(request.options.headers.Authorization, 'Bearer re_test');
    const payload = JSON.parse(request.options.body);
    assert.deepStrictEqual(payload.to, ['karebykari@gmail.com']);
    assert.strictEqual(payload.reply_to, 'customer@example.com');
    assert.match(payload.subject, /New booking/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }

  console.log('Booking notification tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
