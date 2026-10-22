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
npm run dev -w client
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
| `PORT` | API and built app. Default `47291`. |
| `MONGODB_URI` | MongoDB connection. |
| `JWT_SECRET` | Signs the session cookie. Change it before sharing a server. |
| `SEED_DEMO` | Seeds the KS Sports shop when `true`. |
| `EXPOSE_RESET_LINK` | Returns the password-reset URL in the app when mail is not configured. Turn this off on a public server. |
| `CHROME_PATH` | Chrome used to print invoice and catalog PDFs. |
| `COOKIE_SECURE` | Set `true` only behind HTTPS. |
| `CLIENT_ORIGIN` | Browser origin allowed to call the API with cookies. |

Logos, product photos, and private supplier bills are stored under `uploads/`. Supplier bills sit in a private folder and are not served as public files. Replace the logo from Settings whenever the real mark is ready.
