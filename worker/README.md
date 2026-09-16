# Black Bridge Mindset Cloudflare Worker

This Worker serves the website's static assets and handles the contact, newsletter, booking, admin, and YouTube API routes.

## Deploy

From the repository root:

```bash
npm run build
npx wrangler deploy --config worker/wrangler.toml
```

The production GitHub Actions workflow uses the same command. It requires the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Cloudflare configuration

`worker/wrangler.toml` contains the existing D1/KV bindings and the following production configuration:

- Worker routes for `blackbridgemindset.com/*` and `www.blackbridgemindset.com/*`
- Worker Static Assets from `../dist`, bound as `ASSETS`
- Cloudflare Email Service binding `EMAIL`, restricted to `noreply@blackbridgemindset.com`
- Contact delivery to `EMAIL_TO` from `EMAIL_FROM`

Before deploying, onboard `blackbridgemindset.com` in Cloudflare Email Service and verify the sender domain/address. Publish the SPF, DKIM, and DMARC records Cloudflare provides.

Set local-only values in `worker/.dev.vars` using `worker/.dev.vars.example` as a template. Set production secrets with Wrangler:

```bash
npx wrangler secret put ADMIN_OTP_SECRET --config worker/wrangler.toml
npx wrangler secret put ADMIN_SESSION_SECRET --config worker/wrangler.toml
npx wrangler secret put ADMIN_ALLOWED_EMAILS --config worker/wrangler.toml
npx wrangler secret put YOUTUBE_API_KEY --config worker/wrangler.toml
```

`EMAIL_TO`, `EMAIL_FROM`, `FROM_NAME`, `ALLOWED_ORIGINS`, and the schedule settings are non-secret Worker variables in `wrangler.toml`. D1 and KV are already Cloudflare-native and are retained.

## Email sending

All application email now uses `env.EMAIL.send(...)`. Recipient lists are split into batches of 50 to respect Cloudflare Email Service's combined recipient limit, including newsletter/admin broadcasts.

SendGrid and MailChannels are no longer used. Delete any old `SENDGRID_API_KEY` secret from the previous deployment after the Cloudflare Worker is live.

## Scheduling

Invite-only scheduling is implemented under `/api/schedule/` and uses the configured KV/D1 bindings. Route-specific details are in `worker/src/api/schedule/README.md`.
