# Team Tools

Internal app with three tools: Humanizer, AI Detector and Plagiarism Checker.
Every page and API route requires signing in with the team account's email
and password. Behind it, the app acts as one team account in the backend, which has
no word tiers, credits, quotas or rate limits. Every run is logged by the
backend and shows up in the admin panel under **Team Usage**.

## How it works

The browser only talks to this app. `app/api/tools/[...path]` forwards each
request to the backend with the team account's access token:

- The account's email and password live in server env vars. The browser never
  sees them or the token.
- The token is cached per server instance and renewed before it expires, or
  straight away after a 401.
- Only the backend routes these three tools need are forwarded
  (`lib/server/allowedRoutes.ts`). Anything else returns 404.

## Setup

1. Create the team account once, from the backend repo:

   ```
   INTERNAL_USER_PASSWORD='<long password>' node scripts/create-unlimited-user.js team@yourdomain.com "Team"
   ```

   Use an email that is not a customer account. The script refuses to take over
   an existing regular account.

2. Copy `.env.example` to `.env.local` and fill it in:

   | Variable | Value |
   | --- | --- |
   | `BACKEND_API_URL` | Backend base URL including `/v1` |
   | `TEAM_ACCOUNT_EMAIL` | Email from step 1 |
   | `TEAM_ACCOUNT_PASSWORD` | Password from step 1 |
   | `NEXT_PUBLIC_APP_NAME` | Name shown in the header (default "Team Tools") |

3. `npm install`, then `npm run dev`.

## Deploying on Vercel

Import the repo, set the variables above in Project Settings → Environment
Variables, and deploy. No other configuration is needed.

Uploads pass through a Vercel function, which caps request bodies at 4.5 MB, so
the app accepts files up to 4 MB.

Sessions last 7 days. To sign everyone out, set a new team account password
(rerun the backend script) and update `TEAM_ACCOUNT_PASSWORD`.

## Revoking access

From the backend repo: `node scripts/create-unlimited-user.js --revoke team@yourdomain.com`.
The account then falls back to normal free-plan limits.
