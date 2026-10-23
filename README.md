# KS Sports

KS Sports is the business desk for a sports shop. The owner keeps a product catalog, buys stock from suppliers, sells to customers with GST or ordinary invoices, tracks machines and expenses, and reads the result on one dashboard.

Purchases are money going out and stock coming in. Retail sales are money coming in and stock going out. Expenses are the cost of running the shop and do not change stock. Issued invoices keep the shop, customer, items, tax, and purchase cost from the day they were saved.

A GSTIN is optional. With one, new invoices can show CGST and SGST for the same state, or IGST for another state. Without one, the bill stays a normal invoice and does not invent GST. KS Sports checks the GSTIN format and checksum, and that it matches the state and PAN when those are filled in. It does not decide HSN/SAC codes, which rate applies, or whether a particular bill meets every legal rule. Rates live in Settings.

## Run it

You need Node.js 20 or newer and MongoDB.

```bash
npm install
cp .env.example .env
npm run mongo
npm run build
npm start
```

`npm run mongo` starts the MongoDB binary in `.tools` if you have unpacked one there. Otherwise point `MONGODB_URI` at your own MongoDB, or use `docker compose up -d` when Docker is available.

Open [http://127.0.0.1:47291](http://127.0.0.1:47291).

The sample shop signs in as `demo@kssports.test` / `Demo@12345` when `SEED_DEMO=true`. An older demo login is moved to that address on startup.

For UI work while the API is already running:

```bash
npm --prefix client run dev
```

That Vite server proxies `/api` to port 47291.

## Checks

```bash
npm test
npm run typecheck
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | API and built app. Default `47291`. Render sets this itself. |
| `MONGODB_URI` | MongoDB connection. |
| `JWT_SECRET` | Signs the session cookie. Change it before sharing a server. |
| `SEED_DEMO` | Seeds the KS Sports shop when `true`. Ignored when `NODE_ENV=production`. |
| `EXPOSE_RESET_LINK` | Returns the password-reset URL in the app when mail is not configured. Stays off in production unless set to `true`. |
| `CHROME_PATH` | Optional. When Chrome is installed, invoice and catalog PDFs use it. Without it, KS Sports still writes the PDF itself. |
| `COOKIE_SECURE` | Set `true` only behind HTTPS. Production turns this on. |
| `CLIENT_ORIGIN` | Browser origins allowed to call the API. One origin, or several separated by commas. `kssportsbilling.vercel.app` and its Vercel preview links are already allowed. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name. All three Cloudinary values are required before uploads leave disk. |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |
| `VITE_API_URL` | Render origin for a production frontend build. Leave empty locally. |

Logos, product photos, and private supplier bills are stored under `uploads/` when Cloudinary is not configured. With Cloudinary configured, public images go to Cloudinary and private bills stay behind the signed-in document route. Supplier bills are not served as public files.

## Production

The client is a static Vite build. On Vercel, set the project root to `client`, the build command to `npm run build`, and the output directory to `dist`. `client/vercel.json` sends routes such as `/login` and `/products` back to `index.html`.

Set `VITE_API_URL` on Vercel to the Render origin, with no trailing slash. Do not set it for local development. The Vite dev server keeps proxying `/api` to the local API.

Render runs the API from the repository root:

```bash
npm install && npm run build -w server
npm start
```

`npm start` runs `node dist/index.js` and listens on Render's `PORT`. Set `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (the exact Vercel origin), `COOKIE_SECURE=true`, `SEED_DEMO=false`, `EXPOSE_RESET_LINK=false`, `NODE_ENV=production`, and the three Cloudinary variables. Leave `CHROME_PATH` unset. Catalog, invoice, and report PDFs are still created. Production does not seed demo data.
