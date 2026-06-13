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
    from app.models.models import (
        User, UserRole, Professional, Patient,
        Booking, Payment, Assessment,
        DocStatus, BookingStatus, PaymentStatus
    )
    from datetime import datetime, timedelta

    # Clear all
    for model in [Assessment, Payment, Booking, Professional, Patient, User]:
        db.query(model).delete()
    db.commit()

    # ── Users ──
    client = User(id="user-admin-001", email="admin@cuida.me",
        password_hash=hash_password("admin123"), full_name="Ana Carolina Mendes",
        phone="(11) 98765-4321", cpf="123.456.789-00",
        role=UserRole.client, is_active=True, is_verified=True)

    pro1 = User(id="user-pro-001", email="enfermeira@cuida.me",
        password_hash=hash_password("pro123"), full_name="Maria Santos Oliveira",
        phone="(11) 91234-5678", cpf="987.654.321-00",
        role=UserRole.nurse, is_active=True, is_verified=True)

    pro2 = User(id="user-pro-002", email="tecnico@cuida.me",
        password_hash=hash_password("pro123"), full_name="João Lima Costa",
        phone="(11) 99876-5432", cpf="456.789.123-00",
        role=UserRole.technician, is_active=True, is_verified=True)

    pro3 = User(id="user-pro-003", email="cuidadora@cuida.me",
        password_hash=hash_password("pro123"), full_name="Patricia Souza Ferreira",
        phone="(11) 97654-3210", cpf="789.123.456-00",
        role=UserRole.caregiver, is_active=True, is_verified=True)

    db.add_all([client, pro1, pro2, pro3])
    db.commit()

    # ── Professional profiles ──
    # Nurse — highly rated, multiple specialties
    nurse = Professional(id="prof-001", user_id="user-pro-001",
        council_number="123456", council_state="SP", council_type="COREN",
        specialties=["Cuidados domiciliares gerais", "Pós-operatório / curativos", "Cuidados com idosos"],
        service_radius=25, city="São Paulo", state="SP",
        latitude=-23.5505, longitude=-46.6333,
        hourly_rate=150.0, is_available=True,
        approval_status=DocStatus.approved,
        rating_avg=4.9, rating_count=87)

    # Technician — mid range
    tech = Professional(id="prof-002", user_id="user-pro-002",
        council_number="654321", council_state="SP", council_type="COREN",
        specialties=["Cuidados domiciliares gerais", "Paciente oncológico"],
        service_radius=15, city="São Paulo", state="SP",
        latitude=-23.5605, longitude=-46.6433,
        hourly_rate=100.0, is_available=True,
        approval_status=DocStatus.approved,
        rating_avg=4.7, rating_count=43)

    # Caregiver — affordable
    caregiver = Professional(id="prof-003", user_id="user-pro-003",
        council_number="", council_state="SP", council_type="CERTIFICADO",
        specialties=["Cuidados com idosos", "Acompanhamento / companheirismo"],
        service_radius=20, city="São Paulo", state="SP",
        latitude=-23.5705, longitude=-46.6533,
        hourly_rate=70.0, is_available=True,
        approval_status=DocStatus.approved,
        rating_avg=4.8, rating_count=31)

    db.add_all([nurse, tech, caregiver])

    # ── Patient ──
    patient = Patient(id="patient-001", user_id="user-admin-001",
        patient_name="Roberto Mendes", age=78, relation="Filho(a)",
        diagnoses="Diabetes tipo 2, hipertensão arterial, mobilidade reduzida",
        allergies="Penicilina, AAS",
        medications="Metformina 500mg 2x/dia, Losartana 50mg 1x/dia, AAS 100mg 1x/dia",
        devices=["catheter"],
        mobility="ambulatory",
        address="Rua das Flores, 123, Jardins, São Paulo - SP, CEP 01403-000",
        latitude=-23.5605, longitude=-46.6433)

    db.add(patient)
    db.commit()

    # ── Bookings ──
    now = datetime.utcnow()

    booking1 = Booking(id="booking-001",
        patient_id="patient-001", professional_id="prof-001",
        service_type="Curativo complexo",
        procedures=["Troca de curativo", "Monitoramento de sinais vitais"],
        scheduled_start=now + timedelta(hours=3),
        scheduled_end=now + timedelta(hours=6),
        status=BookingStatus.accepted,
        total_price=450.0, platform_fee=54.0, pro_payout=396.0,
        notes="Paciente com mobilidade reduzida. Curativo na perna direita pós-cirurgia.")

    booking2 = Booking(id="booking-002",
        patient_id="patient-001", professional_id="prof-002",
        service_type="Banho no leito e higiene",
        procedures=["Banho no leito", "Higiene oral", "Troca de roupa de cama"],
        scheduled_start=now - timedelta(days=1, hours=3),
        scheduled_end=now - timedelta(days=1, hours=1),
        actual_checkin=now - timedelta(days=1, hours=3),
        actual_checkout=now - timedelta(days=1, hours=1),
        checkin_lat=-23.5605, checkin_lng=-46.6433,
        status=BookingStatus.completed,
        total_price=200.0, platform_fee=24.0, pro_payout=176.0)

    booking3 = Booking(id="booking-003",
        patient_id="patient-001", professional_id="prof-001",
        service_type="Administração de medicamentos",
        procedures=["Administração de medicamentos", "Verificação de pressão arterial", "Glicemia capilar"],
        scheduled_start=now - timedelta(days=5),
        scheduled_end=now - timedelta(days=5) + timedelta(hours=2),
        actual_checkin=now - timedelta(days=5),
        actual_checkout=now - timedelta(days=5) + timedelta(hours=2),
        status=BookingStatus.completed,
        total_price=300.0, platform_fee=36.0, pro_payout=264.0)

    db.add_all([booking1, booking2, booking3])
    db.commit()

    # ── Payments ──
    pay2 = Payment(booking_id="booking-002", amount=200.0, commission=24.0,
        pro_payout=176.0, currency="BRL", method="pix",
        status=PaymentStatus.paid, paid_at=now - timedelta(days=1))
    pay3 = Payment(booking_id="booking-003", amount=300.0, commission=36.0,
        pro_payout=264.0, currency="BRL", method="card",
        status=PaymentStatus.paid, paid_at=now - timedelta(days=5))
    db.add_all([pay2, pay3])

    # ── Assessments ──
    a1 = Assessment(booking_id="booking-002", reviewer_id="user-admin-001",
        reviewee_id="user-pro-002", rating=5,
        comment="João foi muito atencioso e pontual. Recomendo!")
    a2 = Assessment(booking_id="booking-003", reviewer_id="user-admin-001",
        reviewee_id="user-pro-001", rating=5,
        comment="Maria é excelente profissional, muito cuidadosa e técnica.")
    db.add_all([a1, a2])
    db.commit()

    return {
        "status": "seeded ✅",
        "accounts": [
            "admin@cuida.me / admin123 (cliente)",
            "enfermeira@cuida.me / pro123 (enfermeira - COREN 123456-SP)",
            "tecnico@cuida.me / pro123 (técnico - COREN 654321-SP)",
            "cuidadora@cuida.me / pro123 (cuidadora - certificado)",
        ],
        "data": "3 profissionais aprovados, 1 paciente, 3 agendamentos, 2 pagamentos, 2 avaliações"
    }