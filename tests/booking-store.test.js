const assert = require('assert');

process.env.UPSTASH_REDIS_REST_URL = 'https://example.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

const values = new Map();

global.fetch = async (_url, options) => {
  const command = JSON.parse(options.body);
  let result;

  if (command[0] === 'EVAL') {
    const keyCount = Number(command[2]);
    const keys = command.slice(3, 3 + keyCount);
    const args = command.slice(3 + keyCount);

    const conflict = keys.find(key => values.has(key));
    if (conflict) {
      result = conflict;
    } else {
      const bookingKey = args[0];
      const payload = args[1];
      values.set(bookingKey, payload);
      keys.forEach(key => values.set(key, bookingKey));
      result = bookingKey;
    }
  } else if (command[0] === 'MGET') {
    result = command.slice(1).map(key => values.get(key) ?? null);
  } else {
    throw new Error(`Unexpected test command: ${command[0]}`);
  }

  return {
    ok: true,
    json: async () => ({ result }),
  };
};

const {
  createBooking,
  expandDateRange,
  getDateStates,
} = require('../lib/booking-store');

async function run() {
  assert.deepStrictEqual(
    expandDateRange('2026-08-10', '2026-08-12', { allowPast: true }),
    ['2026-08-10', '2026-08-11', '2026-08-12']
  );
  assert.throws(
    () => expandDateRange('2026-08-12', '2026-08-10', { allowPast: true }),
    /end date/
  );

  const first = {
    id: 'first',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    dates: ['2026-08-10', '2026-08-11', '2026-08-12'],
  };
  const second = {
    id: 'second',
    startDate: '2026-08-11',
    endDate: '2026-08-13',
    dates: ['2026-08-11', '2026-08-12', '2026-08-13'],
  };

  const [firstResult, secondResult] = await Promise.all([
    createBooking(first),
    createBooking(second),
  ]);

  assert.strictEqual(firstResult.ok, true);
  assert.strictEqual(secondResult.ok, false);
  assert.strictEqual(secondResult.conflictDate, '2026-08-11');

  const states = await getDateStates(['2026-08-10', '2026-08-11', '2026-08-13']);
  assert.strictEqual(states[0].type, 'booked');
  assert.strictEqual(states[1].type, 'booked');
  assert.strictEqual(states[2].type, 'available');

  console.log('Booking store tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
