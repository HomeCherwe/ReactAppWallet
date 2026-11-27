# MyWallet

Особистий гаманець: рахунки, транзакції, підписки, аналітика. Банки підтягуються самі (Monobank, TrueLayer), є AI-асистент і коннектор для Claude.

## Що де

| Папка | Що це | Де працює |
|---|---|---|
| `backend/` | Сервер (Express) | Vercel: `react-app-wallet-api.vercel.app` |
| `frontend/` | Сайт (React + Vite) | GitHub Pages: `homecherwe.github.io/ReactAppWallet/` |
| `mobile/` | Застосунок для iPhone (Expo) | SideStore (`.ipa` у релізі `ios-latest`) + оновлення по повітрю (EAS Update) |
| `supabase/legacy-sql/` | Старі SQL-скрипти бази, для історії | — |

## Запуск локально

```bash
npm run install:all     # залежності сайту й сервера
npm run dev:backend     # сервер на :8787 (потрібен backend/.env)
npm run dev:frontend    # сайт на :5173
cd mobile && npx expo start
```

## Тести

```bash
cd backend && npm test
```

Справжні маршрути сервера на підставній базі в пам'яті, без секретів і мережі. CI запускає їх на кожен pull request.

## Як виходять зміни

- **Сервер**: злиття в `main` → Vercel викочує сам.
- **Сайт**: злиття в `main` → GitHub Actions збирає й публікує на Pages.
- **iPhone**: зміни в JS → EAS Update по повітрю (вмикається само, без перезапуску). Нативні зміни → підняти `version` у `mobile/app.json` і зібрати `.ipa` (workflow «Build Mobile iOS IPA (Expo)»).
