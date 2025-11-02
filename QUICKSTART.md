# 🚀 Швидкий старт

## Що потрібно зробити

### 1️⃣ Завантажити код на GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 2️⃣ Налаштувати Frontend (GitHub Pages)

1. **Settings → Pages → Source: GitHub Actions**
2. **Settings → Secrets → Actions** → додати:
   - `VITE_API_URL` (залиште поки пустим)
   - `VITE_MONO_TOKEN`
   - `VITE_EXCHANGE_RATE_API` = `https://open.er-api.com/v6/latest/USD`

### 3️⃣ Налаштувати Backend (Vercel)

**Метод 1: Через Dashboard**
1. Зайдіть на [vercel.com](https://vercel.com)
2. Import Project → виберіть репозиторій
3. **Root Directory: `backend`** ⚠️
4. Add Environment Variables з `backend/.env`
5. Deploy

**Метод 2: Через CLI**
```bash
npm i -g vercel
cd backend
vercel
```

### 4️⃣ Зв'язати Frontend з Backend

1. Отримайте URL з Vercel (наприклад: `https://your-api.vercel.app`)
2. GitHub → Settings → Secrets → `VITE_API_URL` → встановіть URL
3. Actions → Deploy to GitHub Pages → Re-run

## ✅ Готово!

- Frontend: `https://YOUR_USERNAME.github.io/YOUR_REPO`
- Backend: `https://YOUR_API.vercel.app`

---

📖 Детальні інструкції в [DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md)

