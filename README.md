# 🃏 Planning Poker

Real-time planning poker app for Scrum teams. Estimate work items during Sprint Refinement and Planning ceremonies.

## ✨ Features

- **Multiple voting scales**: Fibonacci, T-Shirt, Powers of 2, Effort Menu 🍽️
- **Real-time voting**: Results are automatically revealed when everyone has voted
- **Session management**: Open/close sessions, history is preserved
- **Role-based access**: Admin, Session Manager, Voter
- **Voting history**: All votes and rounds are recorded
- **Export**: Download session data as JSON
- **Consensus celebration**: Confetti when everyone votes the same 🎉

## 🚀 Quick Start (Local)

```bash
npm install
npm start
# → http://localhost:3000
# Login: admin / admin
```

No Redis needed for local development — file-based storage is used.

## ☁️ Deploy to Vercel

### 1. Create Upstash Redis (Free)

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (region: `eu-west-1` recommended)
3. Copy the following from the **REST API** tab:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2. Push to GitHub

```bash
cd "Planning Poker"
git init
git add .
git commit -m "Planning Poker v2"
git remote add origin https://github.com/degercanibek/planning-poker.git
git push -u origin main
```

### 3. Create Project on Vercel

1. [vercel.com](https://vercel.com) → **New Project** → Select your GitHub repo
2. Add to **Environment Variables**:

   | Variable | Value |
   |----------|-------|
   | `UPSTASH_REDIS_REST_URL` | URL from Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | Token from Upstash |

3. Click **Deploy**

> **Note**: After the first deployment, you can log in with the default user `admin / admin`. It's recommended to change the password after logging in.

### Alternative: Deploy with Vercel CLI

```bash
npm i -g vercel
vercel
# Answer the environment variable prompts
vercel --prod
```

## 👥 Roles

| Role | Permissions |
|------|-------------|
| **Admin** (👑) | User management + session management + voting |
| **Session Manager** (📋) | Create/close sessions + start voting + vote |
| **Voter** (🗳️) | Voting only |

## 🎴 Voting Scales

| Scale | Values |
|-------|--------|
| 🔢 Fibonacci | 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89 |
| 📊 Modified Fibonacci | 0, ½, 1, 2, 3, 5, 8, 13, 20, 40, 100 |
| 👕 T-Shirt Size | XS, S, M, L, XL, XXL |
| ⚡ Powers of 2 | 0, 1, 2, 4, 8, 16, 32, 64 |
| 🍽️ Effort Menu | 🍰🧁🍕🍔🥩🦃🐄🐘🏔️🌋 |

## 🏗️ Architecture

```
Planning Poker/
├── api/
│   └── index.js          ← Express REST API (Vercel serverless)
├── lib/
│   ├── store.js          ← Storage (Redis / file)
│   └── scales.js         ← Scale definitions
├── public/
│   ├── index.html        ← Single page application
│   ├── styles.css        ← UI styles
│   └── app.js            ← Client logic (polling)
├── server.js             ← Local development server
├── vercel.json           ← Vercel configuration
└── package.json
```

- **Local**: Express server + file-based storage
- **Vercel**: Serverless functions + Upstash Redis + 2s polling
