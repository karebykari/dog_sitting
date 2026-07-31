const {
  expandDateRange,
  getDateStates,
  isConfigured,
  todayInDowningtown,
} = require('../lib/booking-store');

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isConfigured()) {
    return response.status(503).json({ error: 'Online booking is being set up. Please check back soon.' });
  }

  try {
    const start = request.query.start || todayInDowningtown();
    const end = request.query.end || start;
    const dates = expandDateRange(start, end, { allowPast: true, maxDays: 400 });
    const states = await getDateStates(dates);
    return response.status(200).json({
      unavailable: states.filter(state => state.unavailable).map(state => state.date),
    });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
};
