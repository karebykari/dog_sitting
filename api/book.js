const crypto = require('crypto');
const {
  createBooking,
  expandDateRange,
  isConfigured,
} = require('../lib/booking-store');

const SERVICES = new Set([
  'Overnight Boarding',
  'Day Stay',
  'Dog Walking',
]);

function clean(value, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isConfigured()) {
    return response.status(503).json({ error: 'Online booking is being set up. Please call or text for now.' });
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const ownerName = clean(body.ownerName, 100);
    const email = clean(body.email, 160);
    const phone = clean(body.phone, 40);
    const dogName = clean(body.dogName, 100);
    const dogBreed = clean(body.dogBreed, 160);
    const service = clean(body.service, 80);
    const notes = clean(body.notes, 1500);
    const startDate = clean(body.startDate, 10);
    const endDate = clean(body.endDate || body.startDate, 10);

    if (!ownerName || !email || !dogName || !SERVICES.has(service)) {
      return response.status(400).json({ error: 'Please complete all required fields.' });
    }

    const dates = expandDateRange(startDate, endDate);
    const booking = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ownerName,
      email,
      phone,
      dogName,
      dogBreed,
      service,
      startDate,
      endDate,
      dates,
      notes,
    };

    const result = await createBooking(booking);
    if (!result.ok) {
      return response.status(409).json({
        error: `${result.conflictDate} is no longer available. Please choose different dates.`,
        conflictDate: result.conflictDate,
      });
    }

    return response.status(201).json({
      ok: true,
      bookingId: booking.id,
      dates,
      message: 'Your dates are booked.',
    });
  } catch (error) {
    const status = error.code === 'STORAGE_NOT_CONFIGURED' ? 503 : 400;
    return response.status(status).json({ error: error.message || 'Unable to complete the booking.' });
  }
};
