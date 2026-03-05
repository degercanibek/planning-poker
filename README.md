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
