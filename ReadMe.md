# CS160 Bank

CS160 Bank is the web client for a class online banking project. It presents accounts and balances, transfers, bill payments, transaction history, ATM search, notifications, profile settings, and a staff dashboard in one responsive interface. The web client is built with **React Native, Expo, and React Native Web**, as specified in the project's low-level design.

The interface takes its blue-and-white palette, account cards, and persistent banking navigation from Chase's web design. It uses its own **CS160 Bank** name and icon; it is not a Chase product. Check image capture remains a mobile feature, so the web client provides guidance instead of a web upload form.

## Start the web app

```bash
npm install
npm run web
```

Open the URL printed by Expo. With no API configured, select **Open demo dashboard** to explore the screens. Demo accounts and actions use sample data held in browser memory. They reset when the page reloads and do not move real money. In **Profile & settings**, the demo can switch between customer and manager previews.

## Connect the backend

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the FastAPI origin. Expo embeds this value in the browser bundle, so it must not contain a secret. The HTTP client in `src/services/api.js` uses the route names from the low-level design. In API mode, the app fetches data from the server and does not fall back to demo balances if a request fails.

The backend is not included in this repository. Response shapes, MFA behavior, and authorization still need integration testing with the team's FastAPI and Supabase work. Profile editing is available in the demo but disabled in API mode until a dedicated profile update route is defined.

## Project files

| File | Purpose |
| --- | --- |
| `App.jsx` | Web screens, navigation, forms, and in-memory demo interactions |
| `src/services/api.js` | FastAPI request functions and bearer token handling |
| `src/data/demo.js` | Clearly labeled sample data |
| `src/theme.js` | Colors, currency, and date formatting |
| `app.json` / `index.js` | Expo configuration and app entry point |
| `PROJECT_HANDOFF.md` | Architecture, design choices, API assumptions, and next steps |

## Verify

```bash
npm run check
EXPO_NO_TELEMETRY=1 npm run build:web
```

`npm run check` checks the project configuration; the production web build also parses and bundles the JavaScript screens. Automated end-to-end tests and live API integration tests are still pending. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the full handoff.
