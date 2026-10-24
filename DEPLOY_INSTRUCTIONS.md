# 📋 Детальні інструкції по деплою

## Репозиторій: ОДИН GitHub репозиторій з двома папками

```
ReactAppWallet/
├── frontend/          ← GitHub Pages (автоматично)
├── backend/           ← Vercel (з GitHub)
├── .github/
│   └── workflows/
│       └── deploy.yml ← деплой фронтенду
├── vercel.json        ← конфіг для Vercel
└── README.md
```

---

## 🎯 Крок 1: Завантаження коду на GitHub

```bash
# Ініціалізація Git
git init
git add .
git commit -m "Initial commit: separated frontend and backend"

# Додати GitHub репозиторій
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## 🌐 Крок 2: GitHub Pages (Frontend)

### 2.1 Увімкнути GitHub Pages

1. Перейдіть в Settings → Pages
2. Source: **GitHub Actions** (не Branch!)
3. Save

### 2.2 Налаштувати Secrets

Settings → Secrets and variables → Actions → New repository secret

**Додайте:**
- `VITE_API_URL` - залиште пустим поки (додасте після деплою бекенду)
- `VITE_EXCHANGE_RATE_API` - `https://open.er-api.com/v6/latest/USD`
- `VITE_SUPABASE_URL` - URL вашого Supabase проекту
- `VITE_SUPABASE_ANON_KEY` - Anon key з Supabase

### 2.3 Запустити деплой

Actions → Deploy to GitHub Pages → Run workflow → Run workflow

**АБО просто зробіть push:**
```bash
git push
```

---

## ⚡ Крок 3: Vercel (Backend)

### Варіант A: Через Vercel Dashboard (рекомендовано)

1. Зайдіть на [vercel.com](https://vercel.com) і залогіньтесь
2. Натисніть "Add New..." → "Project"
3. Імпортуйте ваш GitHub репозиторій
4. **ВАЖЛИВО!** Під час імпорту проекту:
   - **Root Directory**: `backend` ⚠️
5. Додайте Environment Variables (див. нижче)
6. Натисніть "Deploy"

**Примітка:** Якщо вже імпортували проект БЕЗ Root Directory:
1. Dashboard → Settings → General
2. Scroll down до "Root Directory"  
3. Змініть з `/` на `backend`
4. Save → Auto redeploy

### Варіант B: Через Vercel CLI

```bash
# Встановити Vercel CLI
npm i -g vercel

# Зайти в папку backend
cd backend

# Деплой
vercel

# Додати змінні середовища (після першого деплою)
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add OPENAI_API_KEY
```

### 3.2 Налаштувати змінні середовища в Vercel

Dashboard → Your Project → Settings → Environment Variables

**Додайте всі з `backend/.env`:**

Ключі Monobank і Binance сюди не додаються: кожен користувач вводить свої у застосунку, вони зберігаються в його налаштуваннях у базі.

```
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
OPENAI_API_KEY=your_key
```

### 3.3 Передеплоїти з новими змінними

Dashboard → Deployments → Menu → Redeploy

---

## 🔗 Крок 4: Зв’язати Frontend з Backend

### 4.1 Отримати URL Vercel API

Dashboard → Your Project → Deployments → ваш домен (наприклад: `https://your-project.vercel.app`)

### 4.2 Додати URL в GitHub Secrets

Settings → Secrets and variables → Actions → `VITE_API_URL` → Edit

Встановіть значення: `https://your-project.vercel.app`

### 4.3 Перезапустити деплой фронтенду

Actions → Deploy to GitHub Pages → Menu → Re-run all jobs

**АБО зробіть push:**
```bash
git commit --allow-empty -m "Trigger deploy"
git push
```

---

## ✅ Перевірка

### Frontend
- Відкрийте ваш GitHub Pages URL
- Має відображатися додаток

### Backend
- Відкрийте `https://your-api.vercel.app/api/health` (якщо є такий endpoint)
- Або перевірте в консолі браузера чи йдуть запити на API

---

## 🔄 Подальші деплої

### Frontend
- **Автоматично** при кожному push в `main`/`master`

### Backend
- **Автоматично** при push в `main`/`master` (якщо підключили Vercel до GitHub)
- **АБО** вручну через Dashboard → Deployments → Redeploy

---

## 🐛 Troubleshooting

### Frontend не підтягує API URL
- Перевірте `VITE_API_URL` в GitHub Secrets
- Перезапустіть деплой

### Backend 404 на Vercel
- Перевірте `Root Directory: backend` в налаштуваннях проекту
- Перевірте `vercel.json` в корені репозиторію

### CORS помилки
- Переконайтесь, що `cors()` налаштований в backend
- Перевірте, що фронтенд звертається до правильного URL

### Environment variables не працюють
- В Vercel: Dashboard → Settings → Environment Variables → переконайтесь, що для `Production` додано
- В GitHub: переконайтесь, що Secrets названі правильно з префіксом `VITE_`

---

## 📚 Посилання

- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [Vercel Docs](https://vercel.com/docs)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

