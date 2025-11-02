# 🎯 Почати тут!

## Ваша структура

```
ReactAppWallet/
├── frontend/          ← GitHub Pages автоматично
├── backend/           ← Vercel
├── .github/
│   └── workflows/
│       └── deploy.yml
└── README.md
```

## ⚡ Швидкий деплой

### 1. GitHub репозиторій
```bash
git init
git add .
git commit -m "Ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. GitHub Pages
- Settings → Pages → Source: **GitHub Actions**
- Settings → Secrets → додати:
  - `VITE_API_URL` (поки пустий)
  - `VITE_MONO_TOKEN`
  - `VITE_EXCHANGE_RATE_API` = `https://open.er-api.com/v6/latest/USD`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### 3. Vercel
1. [vercel.com](https://vercel.com) → Import Project
2. **Root Directory: `backend`** ⚠️ (ЦЕ ВАЖЛИВО!)
3. Environment Variables:
   ```
   MONO_TOKEN=...
   MONO_CARD_ID_BLACK=...
   MONO_CARD_ID_WHITE=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   OPENAI_API_KEY=...
   BINANCE_API_KEY=...
   BINANCE_API_SECRET=...
   ```
4. Deploy

### 4. Зв'язати
1. Отримайте URL з Vercel
2. GitHub → Secrets → `VITE_API_URL` → встановіть URL
3. Перезапустіть деплой GitHub Pages

## ✅ Готово!
📖 Деталі в [DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md)

