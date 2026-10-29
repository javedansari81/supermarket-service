# MFMart customer shop

Mobile-first website where customers log in with a mobile OTP and order online (one login for all
stores). Uses the customer API under `/api/v1/shop` of `supermarket-api`. See `ONLINE_ORDERING.md`.

```bash
npm install
cp .env.example .env.local   # VITE_API_URL, default http://localhost:8000/api/v1
npm run dev                  # http://localhost:3001
npm run build && npm run lint
```

Local login needs `OTP_PROVIDER=console` in `supermarket-api/.env`; the code is then printed in the API
server log instead of being sent by SMS.
