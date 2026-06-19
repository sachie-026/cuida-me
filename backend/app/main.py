from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import Base, engine, get_db
from app.routes import auth, professionals, bookings, admin, ratings, users, documents

# Create tables
Base.metadata.create_all(bind=engine)

# ── Runtime migrations ─────────────────────────────────────────────────────
# Safely add new columns if they don't exist yet (idempotent)
def run_migrations():
    migrations = [
        # Professional table — new columns from pricing update
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS services_offered JSON DEFAULT '[]'::json",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS markup_pct INTEGER DEFAULT 0",
        # Booking table — new pricing + scheduling columns
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS services JSON DEFAULT '[]'::json",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_hours INTEGER",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS shift VARCHAR DEFAULT 'day'",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS distance_km FLOAT DEFAULT 0.0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS base_price FLOAT",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS markup_pct INTEGER DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS surcharge_pct FLOAT DEFAULT 0.0",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception as e:
                print(f"Migration skipped: {e}")
        conn.commit()
    print("✅ Migrations complete")

run_migrations()
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cuida.me API",
    version="1.0.0",
    redirect_slashes=False,
)

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
app.include_router(documents.router,     prefix="/api")

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
        Booking, Payment, Assessment, Document,
        DocStatus, BookingStatus, PaymentStatus
    )
    from app.utils.pricing import CAREGIVER_SERVICES, TECHNICIAN_SERVICES, NURSE_SERVICES
    from datetime import datetime, timedelta
    now = datetime.utcnow()

    for model in [Assessment, Payment, Booking, Document, Professional, Patient, User]:
        db.query(model).delete()
    db.commit()

    db.add_all([
        User(id="user-admin-001", email="admin@cuida.me", password_hash=hash_password("admin123"), full_name="Carlos Eduardo Silva", phone="(11) 98765-0001", cpf="111.111.111-01", role=UserRole.admin, is_active=True, is_verified=True),
        User(id="user-admin-002", email="admin2@cuida.me", password_hash=hash_password("admin123"), full_name="Fernanda Lima Souza", phone="(11) 98765-0002", cpf="111.111.111-02", role=UserRole.admin, is_active=True, is_verified=True),
        User(id="user-client-001", email="cliente@cuida.me", password_hash=hash_password("client123"), full_name="Ana Carolina Mendes", phone="(11) 97654-0001", cpf="222.222.222-01", role=UserRole.client, is_active=True, is_verified=True),
        User(id="user-client-002", email="cliente2@cuida.me", password_hash=hash_password("client123"), full_name="Roberto Alves Costa", phone="(11) 97654-0002", cpf="222.222.222-02", role=UserRole.client, is_active=True, is_verified=True),
        User(id="user-client-003", email="cliente3@cuida.me", password_hash=hash_password("client123"), full_name="Beatriz Santos Ferreira", phone="(11) 97654-0003", cpf="222.222.222-03", role=UserRole.client, is_active=True, is_verified=True),
        User(id="user-nurse-001", email="enfermeira@cuida.me", password_hash=hash_password("pro123"), full_name="Maria Santos Oliveira", phone="(11) 91234-0001", cpf="333.333.333-01", role=UserRole.nurse, is_active=True, is_verified=True),
        User(id="user-nurse-002", email="enfermeira2@cuida.me", password_hash=hash_password("pro123"), full_name="Patricia Lima Rodrigues", phone="(11) 91234-0002", cpf="333.333.333-02", role=UserRole.nurse, is_active=True, is_verified=True),
        User(id="user-tech-001", email="tecnico@cuida.me", password_hash=hash_password("pro123"), full_name="João Lima Costa", phone="(11) 92345-0001", cpf="444.444.444-01", role=UserRole.technician, is_active=True, is_verified=True),
        User(id="user-tech-002", email="tecnico2@cuida.me", password_hash=hash_password("pro123"), full_name="André Pereira Nunes", phone="(11) 92345-0002", cpf="444.444.444-02", role=UserRole.technician, is_active=True, is_verified=True),
        User(id="user-care-001", email="cuidadora@cuida.me", password_hash=hash_password("pro123"), full_name="Luciana Ferreira Dias", phone="(11) 93456-0001", cpf="555.555.555-01", role=UserRole.caregiver, is_active=True, is_verified=True),
        User(id="user-care-002", email="cuidadora2@cuida.me", password_hash=hash_password("pro123"), full_name="Claudia Moreira Santos", phone="(11) 93456-0002", cpf="555.555.555-02", role=UserRole.caregiver, is_active=True, is_verified=True),
    ])
    db.commit()

    db.add_all([
        Professional(id="prof-nurse-001", user_id="user-nurse-001",
            council_number="123456", council_state="SP", council_type="COREN",
            services_offered=NURSE_SERVICES,
            markup_pct=10,
            service_radius=25, city="São Paulo", state="SP",
            latitude=-23.5505, longitude=-46.6333,
            is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.9, rating_count=87),
        Professional(id="prof-nurse-002", user_id="user-nurse-002",
            council_number="789012", council_state="SP", council_type="COREN",
            services_offered=NURSE_SERVICES,
            markup_pct=20,
            service_radius=20, city="São Paulo", state="SP",
            latitude=-23.5605, longitude=-46.6433,
            is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.8, rating_count=52),
        Professional(id="prof-tech-001", user_id="user-tech-001",
            council_number="654321", council_state="SP", council_type="COREN",
            services_offered=TECHNICIAN_SERVICES,
            markup_pct=0,
            service_radius=15, city="São Paulo", state="SP",
            latitude=-23.5705, longitude=-46.6533,
            is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.7, rating_count=43),
        Professional(id="prof-tech-002", user_id="user-tech-002",
            council_number="345678", council_state="SP", council_type="COREN",
            services_offered=TECHNICIAN_SERVICES,
            markup_pct=5,
            service_radius=20, city="São Paulo", state="SP",
            latitude=-23.5805, longitude=-46.6633,
            is_available=False, approval_status=DocStatus.approved,
            rating_avg=4.6, rating_count=28),
        Professional(id="prof-care-001", user_id="user-care-001",
            council_number="", council_state="SP", council_type="CERTIFICADO",
            services_offered=CAREGIVER_SERVICES,
            markup_pct=0,
            service_radius=20, city="São Paulo", state="SP",
            latitude=-23.5905, longitude=-46.6733,
            is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.8, rating_count=31),
        Professional(id="prof-care-002", user_id="user-care-002",
            council_number="", council_state="SP", council_type="CERTIFICADO",
            services_offered=CAREGIVER_SERVICES,
            markup_pct=0,
            service_radius=15, city="São Paulo", state="SP",
            latitude=-23.6005, longitude=-46.6833,
            is_available=False, approval_status=DocStatus.pending,
            rating_avg=0.0, rating_count=0),
    ])

    db.add_all([
        Patient(id="patient-001", user_id="user-client-001", patient_name="Roberto Mendes", age=78, relation="Filho(a)", diagnoses="Diabetes tipo 2, hipertensão arterial", allergies="Penicilina", medications="Metformina 500mg, Losartana 50mg", devices=["catheter"], mobility="ambulatory", address="Rua das Flores, 123, Jardins, São Paulo - SP", latitude=-23.5605, longitude=-46.6433),
        Patient(id="patient-002", user_id="user-client-002", patient_name="Margarida Costa", age=82, relation="Cônjuge", diagnoses="AVC isquêmico, hemiplegia direita", allergies="Dipirona", medications="AAS 100mg, Clopidogrel 75mg", devices=["gastrostomy","catheter"], mobility="bedridden", address="Av. Paulista, 456, Bela Vista, São Paulo - SP", latitude=-23.5705, longitude=-46.6533),
        Patient(id="patient-003", user_id="user-client-003", patient_name="Beatriz Santos", age=45, relation="Próprio paciente", diagnoses="Pós-operatório de colecistectomia", allergies="Nenhuma", medications="Dipirona 1g SOS", devices=[], mobility="ambulatory", address="Rua Augusta, 789, Consolação, São Paulo - SP", latitude=-23.5505, longitude=-46.6333),
    ])
    db.commit()

    db.add_all([
        Booking(id="booking-001", patient_id="patient-001", professional_id="prof-nurse-001",
            service_type="Cuidado Pós-Hospitalar",
            services=["Curativo complexo","Monitoramento de sinais vitais"],
            duration_hours=3, shift="day",
            scheduled_start=now+timedelta(hours=3), scheduled_end=now+timedelta(hours=6),
            status=BookingStatus.accepted,
            base_price=180.0, markup_pct=10, surcharge_pct=0,
            total_price=198.0, platform_fee=23.76, pro_payout=174.24),
        Booking(id="booking-002", patient_id="patient-001", professional_id="prof-tech-001",
            service_type="Cuidado com Idosos",
            services=["Banho e higiene pessoal","Alimentação assistida"],
            duration_hours=2, shift="day",
            scheduled_start=now-timedelta(days=2,hours=3), scheduled_end=now-timedelta(days=2,hours=1),
            actual_checkin=now-timedelta(days=2,hours=3), actual_checkout=now-timedelta(days=2,hours=1),
            status=BookingStatus.completed,
            base_price=120.0, markup_pct=0, surcharge_pct=0,
            total_price=120.0, platform_fee=14.4, pro_payout=105.6),
        Booking(id="booking-003", patient_id="patient-001", professional_id="prof-nurse-001",
            service_type="Cuidado de Doença Crônica",
            services=["Administração de medicamentos","Glicemia capilar","Administração de insulina"],
            duration_hours=2, shift="day",
            scheduled_start=now-timedelta(days=7), scheduled_end=now-timedelta(days=7)+timedelta(hours=2),
            actual_checkin=now-timedelta(days=7), actual_checkout=now-timedelta(days=7)+timedelta(hours=2),
            status=BookingStatus.completed,
            base_price=180.0, markup_pct=10, surcharge_pct=0,
            total_price=198.0, platform_fee=23.76, pro_payout=174.24),
        Booking(id="booking-004", patient_id="patient-001", professional_id="prof-care-001",
            service_type="Cuidado Acompanhante",
            services=["Acompanhamento / companheirismo","Alimentação assistida"],
            duration_hours=6, shift="day",
            scheduled_start=now+timedelta(days=2), scheduled_end=now+timedelta(days=2,hours=6),
            status=BookingStatus.pending,
            base_price=140.0, markup_pct=0, surcharge_pct=0,
            total_price=140.0, platform_fee=16.8, pro_payout=123.2),
        Booking(id="booking-005", patient_id="patient-002", professional_id="prof-nurse-002",
            service_type="Cuidado Paliativo",
            services=["Avaliação de enfermagem","Cuidados com traqueostomia","Monitoramento de sinais vitais"],
            duration_hours=12, shift="day",
            scheduled_start=now-timedelta(days=1), scheduled_end=now-timedelta(days=1)+timedelta(hours=12),
            actual_checkin=now-timedelta(days=1), actual_checkout=now-timedelta(days=1)+timedelta(hours=12),
            status=BookingStatus.completed,
            base_price=500.0, markup_pct=20, surcharge_pct=0,
            total_price=600.0, platform_fee=72.0, pro_payout=528.0),
        Booking(id="booking-006", patient_id="patient-002", professional_id="prof-tech-001",
            service_type="Cuidado com Idosos",
            services=["Banho e higiene pessoal","Monitoramento de sinais vitais"],
            duration_hours=6, shift="day",
            scheduled_start=now+timedelta(days=1), scheduled_end=now+timedelta(days=1,hours=6),
            status=BookingStatus.accepted,
            base_price=170.0, markup_pct=0, surcharge_pct=0,
            total_price=170.0, platform_fee=20.4, pro_payout=149.6),
        Booking(id="booking-007", patient_id="patient-003", professional_id="prof-nurse-001",
            service_type="Procedimentos de Enfermagem",
            services=["Curativo complexo","Avaliação de enfermagem"],
            duration_hours=2, shift="day",
            scheduled_start=now-timedelta(days=3), scheduled_end=now-timedelta(days=3)+timedelta(hours=2),
            actual_checkin=now-timedelta(days=3), actual_checkout=now-timedelta(days=3)+timedelta(hours=2),
            status=BookingStatus.completed,
            base_price=180.0, markup_pct=10, surcharge_pct=0,
            total_price=198.0, platform_fee=23.76, pro_payout=174.24),
        Booking(id="booking-008", patient_id="patient-003", professional_id="prof-nurse-001",
            service_type="Procedimentos de Enfermagem",
            services=["Curativo complexo"],
            duration_hours=2, shift="day",
            scheduled_start=now+timedelta(days=4), scheduled_end=now+timedelta(days=4,hours=2),
            status=BookingStatus.pending,
            base_price=180.0, markup_pct=10, surcharge_pct=0,
            total_price=198.0, platform_fee=23.76, pro_payout=174.24),
    ])
    db.commit()

    db.add_all([
        Payment(booking_id="booking-002", amount=120.0, commission=14.4, pro_payout=105.6, currency="BRL", method="pix", status=PaymentStatus.paid, paid_at=now-timedelta(days=2)),
        Payment(booking_id="booking-003", amount=198.0, commission=23.76, pro_payout=174.24, currency="BRL", method="card", status=PaymentStatus.paid, paid_at=now-timedelta(days=7)),
        Payment(booking_id="booking-005", amount=600.0, commission=72.0, pro_payout=528.0, currency="BRL", method="pix", status=PaymentStatus.paid, paid_at=now-timedelta(days=1)),
        Payment(booking_id="booking-007", amount=198.0, commission=23.76, pro_payout=174.24, currency="BRL", method="card", status=PaymentStatus.paid, paid_at=now-timedelta(days=3)),
    ])
    db.add_all([
        Assessment(booking_id="booking-002", reviewer_id="user-client-001", reviewee_id="user-tech-001", rating=5, comment="João foi muito atencioso e pontual."),
        Assessment(booking_id="booking-003", reviewer_id="user-client-001", reviewee_id="user-nurse-001", rating=5, comment="Maria é excelente, muito cuidadosa."),
        Assessment(booking_id="booking-005", reviewer_id="user-client-002", reviewee_id="user-nurse-002", rating=5, comment="Patricia demonstrou muito preparo."),
        Assessment(booking_id="booking-007", reviewer_id="user-client-003", reviewee_id="user-nurse-001", rating=4, comment="Muito boa profissional, pontual."),
        Assessment(booking_id="booking-002", reviewer_id="user-tech-001", reviewee_id="user-client-001", rating=5, comment="Família muito organizada."),
        Assessment(booking_id="booking-003", reviewer_id="user-nurse-001", reviewee_id="user-client-001", rating=5, comment="Informações bem documentadas."),
    ])
    db.add_all([
        Document(user_id="user-nurse-001", doc_type="photo_id", file_url="https://placeholder.com/doc1.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="diploma",  file_url="https://placeholder.com/doc2.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="criminal", file_url="https://placeholder.com/doc3.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="selfie",   file_url="https://placeholder.com/doc4.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-002", doc_type="photo_id", file_url="https://placeholder.com/doc5.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-002", doc_type="diploma",  file_url="https://placeholder.com/doc6.jpg", status=DocStatus.approved),
        Document(user_id="user-care-002",  doc_type="photo_id", file_url="https://placeholder.com/doc9.jpg", status=DocStatus.pending),
    ])
    db.commit()

    return {
        "status": "✅ seeded",
        "accounts": {
            "admin":       ["admin@cuida.me / admin123", "admin2@cuida.me / admin123"],
            "clients":     ["cliente@cuida.me / client123", "cliente2@cuida.me / client123", "cliente3@cuida.me / client123"],
            "nurses":      ["enfermeira@cuida.me / pro123 (approved, +10%)", "enfermeira2@cuida.me / pro123 (approved, +20%)"],
            "technicians": ["tecnico@cuida.me / pro123 (approved, +0%)", "tecnico2@cuida.me / pro123 (approved, +5%)"],
            "caregivers":  ["cuidadora@cuida.me / pro123 (approved)", "cuidadora2@cuida.me / pro123 (PENDING)"],
        }
    }