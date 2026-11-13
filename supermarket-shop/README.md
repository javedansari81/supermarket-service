# MFMart customer shop

Mobile-first website where customers log in with a mobile OTP and order online. Each store has its own
address (e.g. `demo-shop.mfmart.co.in`), all served by one build: `VITE_STORE_SITES` maps addresses to stores and
`VITE_DEFAULT_STORE` is used for any other address. Uses the customer API under `/api/v1/shop` of
`supermarket-api`. See `ONLINE_ORDERING.md`.

```bash
npm install
cp .env.example .env.local   # VITE_API_URL; VITE_DEFAULT_STORE=demo-store opens Demo Store on localhost
npm run dev                  # http://localhost:3001
npm run build && npm run lint
```

Local login needs `OTP_PROVIDER=console` in `supermarket-api/.env`; the code is then printed in the API
server log instead of being sent by SMS.
