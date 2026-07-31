const crypto = require('crypto');

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

const DATE_PREFIX = 'kbk:date:';
const BOOKING_PREFIX = 'kbk:booking:';
const BOOKINGS_INDEX = 'kbk:bookings';
const MAX_STAY_DAYS = 31;

function isConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redis(command) {
  if (!isConfigured()) {
    const error = new Error('Booking storage is not configured.');
    error.code = 'STORAGE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || 'Booking storage request failed.');
  }
  return data.result;
}

function parseISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Please choose valid dates.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Please choose valid dates.');
  }
  return date;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function todayInDowningtown() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function expandDateRange(startValue, endValue, options = {}) {
  const { allowPast = false, maxDays = MAX_STAY_DAYS } = options;
  const start = parseISODate(startValue);
  const end = parseISODate(endValue || startValue);

  if (end < start) {
    throw new Error('The end date must be on or after the start date.');
  }
  if (!allowPast && startValue < todayInDowningtown()) {
    throw new Error('Please choose today or a future date.');
  }

  const dayCount = Math.round((end - start) / 86400000) + 1;
  if (dayCount > maxDays) {
    throw new Error(`Please choose ${maxDays} days or fewer.`);
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return toISODate(date);
  });
}

function dateKey(date) {
  return `${DATE_PREFIX}${date}`;
}

function dateFromKey(key) {
  return key.replace(DATE_PREFIX, '');
}

async function getDateStates(dates) {
  if (!dates.length) return [];
  const values = await redis(['MGET', ...dates.map(dateKey)]);
  return dates.map((date, index) => ({
    date,
    value: values[index],
    unavailable: Boolean(values[index]),
    type: values[index]?.startsWith('kbk:booking:') ? 'booked' : values[index] ? 'blocked' : 'available',
  }));
}

async function createBooking(booking) {
  const bookingKey = `${BOOKING_PREFIX}${booking.id}`;
  const dateKeys = booking.dates.map(dateKey);
  const payload = JSON.stringify(booking);
  const script = `
    for i = 1, #KEYS do
      if redis.call("EXISTS", KEYS[i]) == 1 then
        return KEYS[i]
      end
    end
    redis.call("SET", ARGV[1], ARGV[2])
    redis.call("ZADD", ARGV[3], ARGV[4], ARGV[1])
    for i = 1, #KEYS do
      redis.call("SET", KEYS[i], ARGV[1])
    end
    return ARGV[1]
  `;

  const result = await redis([
    'EVAL',
    script,
    dateKeys.length,
    ...dateKeys,
    bookingKey,
    payload,
    BOOKINGS_INDEX,
    Date.now(),
  ]);

  if (typeof result === 'string' && result.startsWith(DATE_PREFIX)) {
    return { ok: false, conflictDate: dateFromKey(result) };
  }
  return { ok: true, bookingKey };
}

async function blockDates(dates) {
  const dateKeys = dates.map(dateKey);
  const blockValue = `block:${crypto.randomUUID()}`;
  const script = `
    for i = 1, #KEYS do
      if redis.call("EXISTS", KEYS[i]) == 1 then
        return KEYS[i]
      end
    end
    for i = 1, #KEYS do
      redis.call("SET", KEYS[i], ARGV[1])
    end
    return "OK"
  `;
  const result = await redis(['EVAL', script, dateKeys.length, ...dateKeys, blockValue]);
  if (typeof result === 'string' && result.startsWith(DATE_PREFIX)) {
    return { ok: false, conflictDate: dateFromKey(result) };
  }
  return { ok: true };
}

async function unblockDates(dates) {
  const dateKeys = dates.map(dateKey);
  const script = `
    local removed = 0
    for i = 1, #KEYS do
      local value = redis.call("GET", KEYS[i])
      if value and string.sub(value, 1, 6) == "block:" then
        redis.call("DEL", KEYS[i])
        removed = removed + 1
      end
    end
    return removed
  `;
  return redis(['EVAL', script, dateKeys.length, ...dateKeys]);
}

async function getSchedule(dates) {
  const states = await getDateStates(dates);
  const bookingKeys = [...new Set(
    states
      .filter(state => state.type === 'booked')
      .map(state => state.value)
  )];

  const payloads = bookingKeys.length
    ? await redis(['MGET', ...bookingKeys])
    : [];

  const bookings = payloads
    .filter(Boolean)
    .map(payload => JSON.parse(payload))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    dates: states.map(({ date, type }) => ({ date, type })),
    bookings,
  };
}

async function cancelBooking(bookingId) {
  const bookingKey = `${BOOKING_PREFIX}${bookingId}`;
  const payload = await redis(['GET', bookingKey]);
  if (!payload) return false;

  const booking = JSON.parse(payload);
  const dateKeys = booking.dates.map(dateKey);
  const script = `
    for i = 1, #KEYS do
      if redis.call("GET", KEYS[i]) == ARGV[1] then
        redis.call("DEL", KEYS[i])
      end
    end
    redis.call("ZREM", ARGV[2], ARGV[1])
    redis.call("DEL", ARGV[1])
    return "OK"
  `;
  await redis([
    'EVAL',
    script,
    dateKeys.length,
    ...dateKeys,
    bookingKey,
    BOOKINGS_INDEX,
  ]);
  return true;
}

module.exports = {
  MAX_STAY_DAYS,
  blockDates,
  cancelBooking,
  createBooking,
  expandDateRange,
  getDateStates,
  getSchedule,
  isConfigured,
  todayInDowningtown,
  unblockDates,
};
