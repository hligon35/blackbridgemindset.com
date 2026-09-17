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
- Resend API delivery using the `RESEND_API_KEY` secret
- Contact delivery to `EMAIL_TO` from `EMAIL_FROM`
- Optional Cloudflare Access protection for Google-based admin SSO

Before deploying, verify `blackbridgemindset.com` in Resend and publish the SPF, DKIM, and DMARC records Resend provides.

Set local-only values in `worker/.dev.vars` using `worker/.dev.vars.example` as a template. Set production secrets with Wrangler:

```bash
npx wrangler secret put ADMIN_OTP_SECRET --config worker/wrangler.toml
npx wrangler secret put ADMIN_SESSION_SECRET --config worker/wrangler.toml
npx wrangler secret put ADMIN_ALLOWED_EMAILS --config worker/wrangler.toml
npx wrangler secret put YOUTUBE_API_KEY --config worker/wrangler.toml
npx wrangler secret put RESEND_API_KEY --config worker/wrangler.toml
```

### Google admin sign-in

The admin login can use Cloudflare Access with Google as the identity provider. In Cloudflare Zero Trust, create an Access application covering `/admin*` and `/api/schedule/admin/*`, enable Google under Login methods, and allow the exact admin email. Put the Access team domain and application audience tag in `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, then redeploy. The Worker validates the Access JWT and still checks `ADMIN_ALLOWED_EMAILS`; the email-code login remains available as a fallback.

If Google says the client is not recognized, correct the Google client ID and secret in Cloudflare Zero Trust under Settings → Authentication → Login methods. Use the exact redirect URI Cloudflare displays for that Google provider; it is not the website or Worker URL.

Initialize the submissions inbox, activity log, and newsletter campaign store in the existing D1 database:

```bash
npx wrangler d1 execute bb_guest_schedule --remote --yes --file ./worker/src/api/schedule/migration-add-admin-inbox.sql --config worker/wrangler.toml
```

`EMAIL_TO`, `EMAIL_FROM`, `FROM_NAME`, `ALLOWED_ORIGINS`, and the schedule settings are non-secret Worker variables in `wrangler.toml`. D1 and KV are already Cloudflare-native and are retained.

## Email sending

All application email now uses the Resend `/emails` API from the Worker. Recipient lists are split into batches of 50 to respect Resend's recipient limit, including newsletter/admin broadcasts. Scheduled newsletters are checked by the Worker cron trigger every 15 minutes.

SendGrid, MailChannels, and Cloudflare Email Service are no longer used. Delete any old provider secrets after the Resend-backed Worker is live.

## Scheduling

Invite-only scheduling is implemented under `/api/schedule/` and uses the configured KV/D1 bindings. Route-specific details are in `worker/src/api/schedule/README.md`.
