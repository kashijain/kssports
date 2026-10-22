# Lekha

Lekha is a billing desk for Indian shops. An owner can register, save the shop, add customers and products, write a GST or non-GST invoice, preview it, download a PDF, print or share it, record a payment, and see sales on the dashboard.

A GSTIN is optional. With one, new invoices can show CGST and SGST for the same state, or IGST for another state. Without one, the bill stays a normal invoice and does not invent GST. Lekha checks the GSTIN format and checksum, and that it matches the state and PAN when those are filled in. It does not decide HSN/SAC codes, which rate applies, or whether a particular bill meets every legal rule. Rates live in Settings and can be changed without rewriting the billing maths. Issued invoices keep the shop, customer, items, and tax from the day they were saved.

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

The sample shop signs in as `demo@lekha.test` / `Demo@12345` when `SEED_DEMO=true`.

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
| `SEED_DEMO` | Seeds the Jaipur textiles shop when `true`. |
| `EXPOSE_RESET_LINK` | Returns the password-reset URL in the app when mail is not configured. Turn this off on a public server. |
| `CHROME_PATH` | Chrome used to print invoice PDFs. |
| `COOKIE_SECURE` | Set `true` only behind HTTPS. |
| `CLIENT_ORIGIN` | Browser origin allowed to call the API with cookies. |

Logos and signatures are stored under `uploads/`. There is no Cloudinary account in this copy; the same upload routes can be pointed at object storage later without changing invoices, because a saved bill keeps a copy of the logo from that day.
