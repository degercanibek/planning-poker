# 🃏 Planning Poker

Scrum ekipleri için gerçek zamanlı planlama pokeri uygulaması. Sprint Refinement ve Planning seremonilerinde iş büyüklüklerini oylayın.

## ✨ Özellikler

- **Çoklu oylama ölçekleri**: Fibonacci, T-Shirt, 2'nin Kuvvetleri, Efor Menüsü 🍽️
- **Gerçek zamanlı oylama**: Herkes oyladığında sonuçlar otomatik açılır
- **Oturum yönetimi**: Oturumlar açılır/kapatılır, geçmiş korunur
- **Rol tabanlı erişim**: Admin, Oturum Yöneticisi, Oylayıcı
- **Oylama geçmişi**: Tüm oylamalar ve turlar kayıt altında
- **Dışa aktarma**: Oturum verilerini JSON olarak indirin
- **Konsensüs kutlaması**: Herkes aynı oyu verince confetti 🎉

## 🚀 Hızlı Başlangıç (Lokal)

```bash
npm install
npm start
# → http://localhost:3000
# Giriş: admin / admin
```

Lokal geliştirmede Redis gerekmez — dosya tabanlı depolama kullanılır.

## ☁️ Vercel'e Deploy

### 1. Upstash Redis Oluşturun (Ücretsiz)

1. [console.upstash.com](https://console.upstash.com) adresine gidin
2. Yeni bir Redis veritabanı oluşturun (region: `eu-west-1` önerilir)
3. **REST API** sekmesinden şu bilgileri kopyalayın:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2. GitHub'a Push Edin

```bash
cd "Planning Poker"
git init
git add .
git commit -m "Planning Poker v2"
git remote add origin https://github.com/KULLANICI/planning-poker.git
git push -u origin main
```

### 3. Vercel'de Projeyi Oluşturun

1. [vercel.com](https://vercel.com) → **New Project** → GitHub reposunu seçin
2. **Environment Variables** bölümüne ekleyin:

   | Değişken | Değer |
   |----------|-------|
   | `UPSTASH_REDIS_REST_URL` | Upstash'ten aldığınız URL |
   | `UPSTASH_REDIS_REST_TOKEN` | Upstash'ten aldığınız token |

3. **Deploy** butonuna basın

> **Not**: İlk deploy'dan sonra varsayılan kullanıcı `admin / admin` ile giriş yapabilirsiniz. Giriş yaptıktan sonra şifreyi değiştirmeniz önerilir.

### Alternatif: Vercel CLI ile Deploy

```bash
npm i -g vercel
vercel
# Environment variables soruları yanıtlayın
vercel --prod
```

## 👥 Roller

| Rol | Yetkiler |
|-----|----------|
| **Admin** (👑) | Kullanıcı yönetimi + oturum yönetimi + oylama |
| **Oturum Yöneticisi** (📋) | Oturum oluşturma/kapatma + oylama başlatma + oylama |
| **Oylayıcı** (🗳️) | Sadece oylama |

## 🎴 Oylama Ölçekleri

| Ölçek | Değerler |
|-------|----------|
| 🔢 Fibonacci | 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89 |
| 📊 Değiştirilmiş Fibonacci | 0, ½, 1, 2, 3, 5, 8, 13, 20, 40, 100 |
| 👕 T-Shirt Bedeni | XS, S, M, L, XL, XXL |
| ⚡ 2'nin Kuvvetleri | 0, 1, 2, 4, 8, 16, 32, 64 |
| 🍽️ Efor Menüsü | 🍰🧁🍕🍔🥩🦃🐄🐘🏔️🌋 |

## 🏗️ Mimari

```
Planning Poker/
├── api/
│   └── index.js          ← Express REST API (Vercel serverless)
├── lib/
│   ├── store.js          ← Depolama (Redis / dosya)
│   └── scales.js         ← Ölçek tanımları
├── public/
│   ├── index.html        ← Tek sayfa uygulama
│   ├── styles.css        ← UI stilleri
│   └── app.js            ← İstemci mantığı (polling)
├── server.js             ← Lokal geliştirme sunucusu
├── vercel.json           ← Vercel yapılandırması
└── package.json
```

- **Lokal**: Express sunucu + dosya tabanlı depolama
- **Vercel**: Serverless fonksiyonlar + Upstash Redis + 2s polling
