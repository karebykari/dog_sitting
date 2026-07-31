const crypto = require('crypto');
const {
  blockDates,
  cancelBooking,
  expandDateRange,
  getSchedule,
  isConfigured,
  todayInDowningtown,
  unblockDates,
} = require('../lib/booking-store');

function authorized(request) {
  const expected = process.env.OWNER_ADMIN_KEY || '';
  const supplied = request.headers['x-admin-key'] || '';
  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isConfigured()) {
    return response.status(503).json({ error: 'Booking storage is not configured.' });
  }
  if (!authorized(request)) {
    return response.status(401).json({ error: 'Incorrect owner password.' });
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const action = body.action;

    if (action === 'list') {
      const startDate = body.startDate || todayInDowningtown();
      const endDate = body.endDate || startDate;
      const dates = expandDateRange(startDate, endDate, { allowPast: true, maxDays: 400 });
      return response.status(200).json(await getSchedule(dates));
    }

    if (action === 'block' || action === 'unblock') {
      const dates = expandDateRange(body.startDate, body.endDate || body.startDate, {
        allowPast: true,
        maxDays: 400,
      });

      if (action === 'block') {
        const result = await blockDates(dates);
        if (!result.ok) {
          return response.status(409).json({
            error: `${result.conflictDate} is already booked or blocked.`,
            conflictDate: result.conflictDate,
          });
        }
        return response.status(200).json({ ok: true, message: 'Dates blocked.', dates });
      }

      const removed = await unblockDates(dates);
      return response.status(200).json({ ok: true, message: `${removed} blocked date(s) reopened.` });
    }

    if (action === 'cancel') {
      const cancelled = await cancelBooking(body.bookingId);
      if (!cancelled) {
        return response.status(404).json({ error: 'Booking not found.' });
      }
      return response.status(200).json({ ok: true, message: 'Booking cancelled and dates reopened.' });
    }

    return response.status(400).json({ error: 'Unknown action.' });
  } catch (error) {
    return response.status(400).json({ error: error.message || 'Unable to update the calendar.' });
  }
};
