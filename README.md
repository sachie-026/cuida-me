# Cuida.me 🩺

**Home care platform connecting patients with verified nursing professionals.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Tailwind CSS |
| i18n | i18next (pt-BR + en) |
| Auth | Google OAuth + JWT |
| Backend | Python FastAPI |
| Database | PostgreSQL (via SQLAlchemy) |
| File uploads | Cloudinary |
| Payments | Stripe Connect + PIX |
| Frontend hosting | Vercel |
| Backend hosting | Railway |

---

## Project Structure

```
cuida-me/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── logo.jpeg
│   ├── src/
│   │   ├── assets/         ← logo and images
│   │   ├── components/
│   │   │   ├── common/     ← Logo, LanguageSwitcher
│   │   │   ├── layout/     ← Navbar, Footer
│   │   │   └── sections/   ← Hero, HowItWorks, etc.
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── auth/       ← Login.jsx
│   │   │   ├── client/     ← Dashboard.jsx
│   │   │   └── professional/ ← Dashboard.jsx
│   │   ├── locales/
│   │   │   ├── pt-BR.json
│   │   │   └── en.json
│   │   ├── i18n.js
│   │   ├── App.jsx
│   │   └── index.js
│   ├── tailwind.config.js
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── core/           ← config, database, security
│   │   ├── models/         ← SQLAlchemy models
│   │   ├── routes/         ← auth, professionals, bookings
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
├── vercel.json
└── README.md
```

---

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/your-org/cuida-me.git
cd cuida-me
```

### 2. Frontend setup
```bash
cd frontend
cp .env.example .env          # fill in your keys
npm install
npm start                     # runs on http://localhost:3000
```

### 3. Backend setup
```bash
cd backend
cp .env.example .env          # fill in your keys
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # runs on http://localhost:8000
```

### 4. Database
Make sure PostgreSQL is running and your `DATABASE_URL` is set in `backend/.env`.
Tables are auto-created on first startup.

---

## Environment Variables

### Frontend (`frontend/.env`)
```
REACT_APP_GOOGLE_CLIENT_ID=
REACT_APP_API_URL=http://localhost:8000
REACT_APP_GOOGLE_MAPS_KEY=
REACT_APP_STRIPE_PUBLIC_KEY=
```

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql://user:password@localhost:5432/cuidame
SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
FRONTEND_URL=http://localhost:3000
```

---

## Deployment

### Frontend → Vercel
1. Push to GitHub
2. Import repo in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy — `vercel.json` handles everything

### Backend → Railway
1. Create new project in Railway
2. Connect GitHub repo, select `/backend` as root
3. Add environment variables
4. Railway auto-detects FastAPI and deploys
5. Add PostgreSQL plugin — Railway provides `DATABASE_URL` automatically

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/auth/google | Google OAuth login |
| POST | /api/auth/register | Email registration |
| POST | /api/auth/login | Email login |
| GET | /api/professionals/nearby | Find nearby professionals |
| PUT | /api/professionals/:id | Update professional profile |
| POST | /api/bookings | Create booking |
| PATCH | /api/bookings/:id/accept | Accept booking |
| PATCH | /api/bookings/:id/checkin | GPS check-in |
| PATCH | /api/bookings/:id/checkout | GPS check-out |
| PATCH | /api/bookings/:id/cancel | Cancel booking |

Full API docs available at `http://localhost:8000/docs` (Swagger UI, auto-generated).

---

## Scalability Notes

Built for Brazil Beta but ready to expand:
- **i18n**: add new locale file in `src/locales/` — zero code changes
- **Document validation**: `council_type` field in Professional model supports COREN (BR), AHPRA (AU), NMC (UK)
- **Payments**: `currency` field in Payment model; swap Stripe config per country
- **Compliance**: LGPD (BR) by default; GDPR-ready via country_code on User model

---

## Roadmap

- [ ] Admin panel (document approval, commission management)
- [ ] Payment integration (Stripe Connect + PIX)
- [ ] Electronic Medical Record (EMR) full flow
- [ ] GPS real-time tracking
- [ ] WhatsApp notifications
- [ ] Mobile app (React Native)
