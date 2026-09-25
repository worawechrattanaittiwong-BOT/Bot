# SCENOVA Mobile UX — Final Feature Parity

Scope: phone-only UX upgrade. Desktop, API behavior and MT5 trading logic remain shared and unchanged.

## M1–M8
- M1 App shell, safe area, dark/light theme
- M2 Home / Dashboard
- M3 Home / Trade / Orders / Stats / More navigation and trading settings
- M4 Open Orders / History / Baskets
- M5 Performance / Analytics
- M6 Account / MT5 / Trial / Packages / Slots
- M7 Installer / Update / System / Live Logs
- M8 Offline feedback, narrow phones, auth/public pages, standalone viewport and final polish

## Feature parity rule
No desktop capability is intentionally removed on phones. Existing actions and server handlers are reused instead of creating mobile trading logic.

## Route audit
All 25 current `apps/web/app/**/page.tsx` routes are reviewed. Each route is covered by either:
1. authenticated Mobile App shell,
2. explicit auth/marketing/public-report mobile presentation, or
3. a redirect into a covered mobile route.

CI fails when a new page route appears without a mobile parity review.

## Isolation
Mobile work is limited to web presentation, route navigation, CSS, metadata and UI contracts. It does not modify EA source, trade direction, sizing, stop, profit or execution rules.
