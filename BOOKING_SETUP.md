# Live booking setup

The site now has a custom date-range booking system:

- Customers can book one day or several consecutive days.
- Every selected calendar day is reserved in one atomic database operation.
- If any selected day is already booked or owner-blocked, the whole request is rejected.
- Only one customer can hold a calendar day.
- The private owner page is `/admin.html`.

## One-time Vercel setup

1. Open the Kare By Kari project in Vercel.
2. Open **Storage** or **Integrations** and add **Upstash Redis**.
3. Connect the new Redis database to this Vercel project. The integration should add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. In **Settings → Environment Variables**, add:
   - Name: `OWNER_ADMIN_KEY`
   - Value: a long private password only the owner knows
   - Environment: Production
5. Redeploy the latest `main` branch.

Environment-variable changes apply only to new deployments.

## How to use it

- Public availability: `/availability.html`
- Customer booking: `/book.html`
- Private owner controls: `/admin.html`

On the owner page, enter `OWNER_ADMIN_KEY` as the password. You can block a
single date or a date range, reopen dates you blocked, review bookings, and
cancel a booking to reopen all of its dates.

Do not share the owner password or commit it to Git.
