# Khoj Khabar

## Run locally

Requires Node.js 22 or newer.

```powershell
npm start
```

Open `http://localhost:4173`.

## Admin access

Open the **Admin** tab and use the development credentials:

- Username: `admin`
- Password: `change-me-now`

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before starting the server to use different credentials:

```powershell
$env:ADMIN_USERNAME = "campus-admin"
$env:ADMIN_PASSWORD = "use-a-strong-password"
npm start
```

Listings are stored in `data/khoj-khabar.sqlite` and survive server restarts. The Admin tab can mark notices as found or remove them.

## Publish on Cloudflare for free

Cloudflare Workers serves the app, while Cloudflare D1 stores the listings.

1. Install Wrangler if needed: `npm install -g wrangler`
2. Log in: `wrangler login`
3. Create the database: `wrangler d1 create khoj-khabar`
4. Copy the returned database ID into `wrangler.toml` as `database_id`.
5. Create the table remotely: `wrangler d1 execute khoj-khabar --remote --file=./schema.sql`
6. Add production admin secrets:

```powershell
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_SECRET
```

Use a long random value for `ADMIN_SECRET`. Wrangler will prompt for each value without putting it in your shell history.

7. Deploy: `npm run cf:deploy`

Cloudflare will provide a public `workers.dev` URL. The existing frontend uses relative API URLs, so no frontend URL changes are needed.

For local Cloudflare emulation, use `npm run cf:dev`. The current Node/SQLite server remains available with `npm start`.

## Make your own computer public without a Cloudflare login

This project can stay hosted on your computer. Install `cloudflared` from the official Cloudflare downloads page, then open two PowerShell windows:

**Window 1: start the app**

```powershell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "use-a-strong-password"
npm start
```

**Window 2: create a public HTTPS link**

```powershell
npm run public
```

Copy the `https://...trycloudflare.com` URL printed by `cloudflared` and share it. Visitors can browse, upload notices, and use the board without logging in. Keep the first PowerShell window and your computer online; closing either one takes the site offline.

Quick Tunnel URLs are temporary and normally change when restarted. This method does not require a Cloudflare account or login. It is suitable for a demo or mini-project; for a permanent address, a hosting account and domain are required.
