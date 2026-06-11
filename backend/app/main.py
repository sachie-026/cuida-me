from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import Base, engine, get_db
from app.routes import auth, professionals, bookings, admin, ratings, users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cuida.me API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api")
app.include_router(professionals.router, prefix="/api")
app.include_router(bookings.router,      prefix="/api")
app.include_router(admin.router,         prefix="/api")
app.include_router(ratings.router,       prefix="/api")
app.include_router(users.router,         prefix="/api")

@app.get("/")
def root():
    return {"message": "Cuida.me API is running 🩺", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/seed-dev")
def seed_dev(db: Session = Depends(get_db)):
    from app.core.security import hash_password
    from app.models.models import User, UserRole, Professional, Patient, DocStatus

    for model in [Professional, Patient, User]:
        db.query(model).delete()
    db.commit()

    admin_user = User(id="user-admin-001", email="admin@cuida.me",
        password_hash=hash_password("admin123"), full_name="Admin Teste",
        phone="(11) 99999-0001", cpf="000.000.000-01",
        role=UserRole.client, is_active=True, is_verified=True)

    pro_user = User(id="user-pro-001", email="enfermeira@cuida.me",
        password_hash=hash_password("pro123"), full_name="Maria Santos",
        phone="(11) 99999-0002", cpf="000.000.000-02",
        role=UserRole.nurse, is_active=True, is_verified=True)

    db.add_all([admin_user, pro_user])
    db.commit()

    professional = Professional(id="prof-001", user_id="user-pro-001",
        council_number="123456", council_state="SP", council_type="COREN",
        specialties=["Cuidados domiciliares gerais"], service_radius=20,
        city="São Paulo", state="SP", hourly_rate=120.0,
        is_available=True, approval_status=DocStatus.approved,
        rating_avg=4.9, rating_count=87)

    patient = Patient(id="patient-001", user_id="user-admin-001",
        patient_name="João Teste", age=75, relation="Filho(a)",
        diagnoses="Diabetes tipo 2", address="São Paulo, SP")

    db.add_all([professional, patient])
    db.commit()

    return {
        "status": "seeded",
        "users": ["admin@cuida.me / admin123", "enfermeira@cuida.me / pro123"]
    }