# Black Bridge Mindset Website

Official website for the Black Bridge Mindset podcast. The React frontend and backend APIs deploy together as one Cloudflare Worker.

## Tech stack

- Frontend: React 19, React Router 7, Vite 7
- Runtime and hosting: Cloudflare Workers Static Assets
- Data: Cloudflare D1 + KV
- Email: Cloudflare Email Service `send_email` binding
- SMS: Twilio (kept for the scheduling text-message feature)

## Project structure

- `src/`: React app source
- `public/`: static assets
- `worker/src/`: Worker API routes and backend logic
- `worker/src/api/schedule/`: scheduling endpoints, admin, newsletter, ICS, and YouTube proxy
- `scripts/`: build-time utilities, including static route entry-point generation

## Local setup

Install the frontend dependencies and create the local frontend environment:

```bash
npm install
cp .env.example .env
npm run dev
```

For local Worker development, copy `worker/.dev.vars.example` to `worker/.dev.vars`, fill in the values, then run:

```bash
npx wrangler dev --config worker/wrangler.toml
```

Build the production frontend with:

```bash
npm run build
```

The build creates route-specific HTML entry points for the public pages, which gives crawlers a real document at each trailing-slash URL.

## Cloudflare setup

The production Worker expects the existing D1/KV bindings in `worker/wrangler.toml`, plus the Cloudflare Email Service binding named `EMAIL`.

1. Add `blackbridgemindset.com` to Cloudflare and point the domain's nameservers at Cloudflare. The registrar can remain wherever it is.
2. In Cloudflare Email Service, onboard `blackbridgemindset.com`, verify `noreply@blackbridgemindset.com`, and publish the SPF/DKIM/DMARC records Cloudflare provides.
3. Create a Cloudflare API token that can deploy Workers and note the account ID.
4. Add these GitHub repository secrets for the deployment workflow:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Set the Worker secrets:

```bash
npx wrangler secret put ADMIN_OTP_SECRET --config worker/wrangler.toml
npx wrangler secret put ADMIN_SESSION_SECRET --config worker/wrangler.toml
npx wrangler secret put ADMIN_ALLOWED_EMAILS --config worker/wrangler.toml
npx wrangler secret put YOUTUBE_API_KEY --config worker/wrangler.toml
```

After the first deployment, confirm the `blackbridgemindset.com/*` and `www.blackbridgemindset.com/*` routes are active. Remove any old SendGrid API key from the old hosting/secret store after the Worker is live; the source no longer reads it.

## APIs and security

- Contact, newsletter, booking, and admin requests are served under `/api/` by the Worker.
- The frontend is served from the same Worker, so production API calls are same-origin.
- Contact and booking endpoints use KV-backed rate limiting.
- YouTube access uses the server-side Worker proxy in production.
- Public pages are indexed through the canonical trailing-slash routes in `public/sitemap.xml`; private/admin routes are marked `noindex`.

See `worker/README.md` and `worker/src/api/schedule/README.md` for endpoint details.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`, which builds the frontend and deploys the Worker plus static assets with Wrangler. A manual deployment can be run from the repository root:

```bash
npm run build
npx wrangler deploy --config worker/wrangler.toml
```

