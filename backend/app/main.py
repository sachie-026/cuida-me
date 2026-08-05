from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import Base, engine, get_db
from app.routes import auth, professionals, bookings, admin, ratings, users, documents
from app.routes import availability, payments, messages, holidays, reports, alerts, alice
from app.core.auth_deps import require_admin as _require_admin
from fastapi import Depends as _Depends

Base.metadata.create_all(bind=engine)

def run_migrations():
    """Idempotent migrations — safe to run on every startup."""
    migrations = [
        # Fix PaymentStatus enum — add new values
        "ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'held'",
        "ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'released'",
        "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'nursing_assistant'",
        # Professional enhancements
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS specialties JSON DEFAULT '[]'",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS rest_until TIMESTAMPTZ",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS reliability_score INTEGER DEFAULT 100",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS client_no_shows INTEGER DEFAULT 0",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS reliability_score INTEGER DEFAULT 100",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS late_cancellations INTEGER DEFAULT 0",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS no_shows INTEGER DEFAULT 0",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS completed_count INTEGER DEFAULT 0",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_new_start TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_new_end TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_status VARCHAR",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS emergency_name VARCHAR",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_confirmed_start BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_confirmed_end BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS has_dispute BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispute_reason TEXT",
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount FLOAT",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkout_lat FLOAT",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkout_lng FLOAT",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_flagged BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checkin_distance INTEGER",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_timer_start TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS late_arrival BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS late_arrival_count INTEGER DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS early_termination BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS early_termination_reason TEXT",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS match_deadline TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS match_batch INTEGER",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS matched_pro_ids JSON DEFAULT '[]'",
        # Reports table
        """CREATE TABLE IF NOT EXISTS reports (
            id VARCHAR PRIMARY KEY,
            booking_id VARCHAR REFERENCES bookings(id),
            reporter_id VARCHAR REFERENCES users(id),
            reported_id VARCHAR REFERENCES users(id),
            report_type VARCHAR,
            reason VARCHAR NOT NULL,
            description TEXT,
            status VARCHAR DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            resolved_at TIMESTAMPTZ
        )""",
        """CREATE TABLE IF NOT EXISTS availability_alerts (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR REFERENCES users(id) NOT NULL,
            alert_type VARCHAR NOT NULL,
            care_type VARCHAR,
            services JSON DEFAULT '[]',
            professional_category VARCHAR,
            preferred_date VARCHAR,
            preferred_time VARCHAR,
            duration_hours INTEGER,
            city VARCHAR,
            state VARCHAR,
            radius_km INTEGER DEFAULT 50,
            status VARCHAR DEFAULT 'active',
            matched_at TIMESTAMPTZ,
            matched_id VARCHAR,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        )""",
        # Fix AvailabilityType enum
        "DO $$ BEGIN CREATE TYPE availabilitytype AS ENUM ('available', 'blocked'); EXCEPTION WHEN duplicate_object THEN null; END $$",
        # Users table
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR",
        # Professional table
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS services_offered JSON DEFAULT '[]'::json",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS markup_pct INTEGER DEFAULT 0",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS years_experience INTEGER",
        "ALTER TABLE professionals ADD COLUMN IF NOT EXISTS bio TEXT",
        # Patient table — representative and emergency contact fields
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_own_account BOOLEAN DEFAULT TRUE",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS representative_name VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS representative_relation VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS representative_phone VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS communication_needs TEXT",
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS additional_notes TEXT",
        # Booking table
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS services JSON DEFAULT '[]'::json",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS care_level INTEGER",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_hours INTEGER",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS shift VARCHAR DEFAULT 'day'",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN DEFAULT FALSE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS distance_km FLOAT DEFAULT 0.0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS base_price FLOAT",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS markup_pct INTEGER DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS surcharge_pct FLOAT DEFAULT 0.0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE",
        # Payment table
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS pix_code TEXT",
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS held_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason VARCHAR",
        # New tables
        """CREATE TABLE IF NOT EXISTS availability (
            id VARCHAR PRIMARY KEY,
            professional_id VARCHAR REFERENCES professionals(id),
            type VARCHAR DEFAULT 'available',
            is_recurring BOOLEAN DEFAULT FALSE,
            day_of_week INTEGER,
            specific_date VARCHAR,
            start_time VARCHAR NOT NULL,
            end_time VARCHAR NOT NULL,
            notes VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS holidays (
            id VARCHAR PRIMARY KEY,
            date VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            scope VARCHAR DEFAULT 'national',
            state VARCHAR,
            city VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR PRIMARY KEY,
            booking_id VARCHAR REFERENCES bookings(id),
            sender_id VARCHAR REFERENCES users(id),
            recipient_id VARCHAR REFERENCES users(id),
            content TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception as e:
                print(f"Migration note: {e}")
        conn.commit()
    print("✅ Migrations complete")

run_migrations()

app = FastAPI(title="Cuida.me API", version="1.0.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/api")
app.include_router(professionals.router,prefix="/api")
app.include_router(bookings.router,     prefix="/api")
app.include_router(admin.router,        prefix="/api")
app.include_router(ratings.router,      prefix="/api")
app.include_router(users.router,        prefix="/api")
app.include_router(documents.router,    prefix="/api")
app.include_router(availability.router, prefix="/api")
app.include_router(payments.router,     prefix="/api")
app.include_router(messages.router,     prefix="/api")
app.include_router(holidays.router,     prefix="/api")
app.include_router(reports.router,      prefix="/api")
app.include_router(alerts.router,       prefix="/api")
app.include_router(alice.router,        prefix="/api")

@app.get("/")
def root():
    return {"message": "Cuida.me API is running 🩺", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/seed-dev")
def seed_dev(
    db:      Session = Depends(get_db),
    dev_key: str     = "",
    credentials: __import__('fastapi').security.HTTPAuthorizationCredentials = Depends(
        __import__('fastapi').security.HTTPBearer(auto_error=False)
    ),
):
    """Dev seed endpoint. Accepts either ?dev_key=cuida-dev-2026 OR a valid admin JWT."""
    from app.core.security import decode_token
    from app.models.models import User, UserRole

    SEED_DEV_KEY = "cuida-dev-2026"
    allowed = False

    # Check dummy key
    if dev_key == SEED_DEV_KEY:
        allowed = True

    # Check admin JWT
    if not allowed and credentials:
        payload = decode_token(credentials.credentials)
        if payload:
            user = db.query(User).filter(User.id == payload.get("sub")).first()
            if user and user.role == UserRole.admin:
                allowed = True

    if not allowed:
        raise __import__('fastapi').HTTPException(
            403, "Access denied. Pass ?dev_key=cuida-dev-2026 or use admin JWT."
        )
    from app.core.security import hash_password
    from app.models.models import (
        User, UserRole, Professional, Patient, Booking, Payment,
        Assessment, Document, DocStatus, BookingStatus, PaymentStatus,
        Availability, AvailabilityType
    )
    from app.utils.pricing import CAREGIVER_SERVICES, NURSING_ASSISTANT_SERVICES, TECHNICIAN_SERVICES, NURSE_SERVICES
    from datetime import datetime, timedelta
    now = datetime.utcnow()

    for model in [Assessment, Payment, Booking, Document, Availability, Professional, Patient, User]:
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
        User(id="user-assist-001", email="auxiliar@cuida.me", password_hash=hash_password("pro123"), full_name="Beatriz Costa Almeida", phone="(11) 92456-0001", cpf="666.666.666-01", role=UserRole.nursing_assistant, is_active=True, is_verified=True),
        User(id="user-care-001", email="cuidadora@cuida.me", password_hash=hash_password("pro123"), full_name="Luciana Ferreira Dias", phone="(11) 93456-0001", cpf="555.555.555-01", role=UserRole.caregiver, is_active=True, is_verified=True),
        User(id="user-care-002", email="cuidadora2@cuida.me", password_hash=hash_password("pro123"), full_name="Claudia Moreira Santos", phone="(11) 93456-0002", cpf="555.555.555-02", role=UserRole.caregiver, is_active=True, is_verified=True),
    ])
    db.commit()

    db.add_all([
        Professional(id="prof-nurse-001", user_id="user-nurse-001", council_number="123456", council_state="SP", council_type="COREN", services_offered=NURSE_SERVICES, specialties=["Home Care / Saúde Domiciliar","Gerontologia / Geriatria","Cuidados Paliativos"], markup_pct=10, service_radius=25, city="São Paulo", state="SP", latitude=-23.5505, longitude=-46.6333, is_available=True, approval_status=DocStatus.approved, rating_avg=4.9, rating_count=87, years_experience=8, bio="Enfermeira especializada em cuidados domiciliares e pós-operatório."),
        Professional(id="prof-nurse-002", user_id="user-nurse-002", council_number="789012", council_state="SP", council_type="COREN", services_offered=NURSE_SERVICES, markup_pct=20, service_radius=20, city="São Paulo", state="SP", latitude=-23.5605, longitude=-46.6433, is_available=True, approval_status=DocStatus.approved, rating_avg=4.8, rating_count=52, years_experience=5, bio="Especialista em UTI domiciliar e cuidados paliativos."),
        Professional(id="prof-tech-001", user_id="user-tech-001", council_number="654321", council_state="SP", council_type="COREN", services_offered=TECHNICIAN_SERVICES, markup_pct=0, service_radius=15, city="São Paulo", state="SP", latitude=-23.5705, longitude=-46.6533, is_available=True, approval_status=DocStatus.approved, rating_avg=4.7, rating_count=43),
        Professional(id="prof-tech-002", user_id="user-tech-002", council_number="345678", council_state="SP", council_type="COREN", services_offered=TECHNICIAN_SERVICES, markup_pct=5, service_radius=20, city="São Paulo", state="SP", latitude=-23.5805, longitude=-46.6633, is_available=False, approval_status=DocStatus.approved, rating_avg=4.6, rating_count=28),
        Professional(id="prof-assist-001", user_id="user-assist-001", council_number="998877", council_state="SP", council_type="COREN", services_offered=NURSING_ASSISTANT_SERVICES, specialties=["Home Care / Saúde Domiciliar","Cuidado de Idosos","Cuidados Paliativos"], markup_pct=0, service_radius=20, city="São Paulo", state="SP", latitude=-23.5755, longitude=-46.6583, is_available=True, approval_status=DocStatus.approved, rating_avg=4.7, rating_count=18, bio="Auxiliar de enfermagem com experiência em cuidados domiciliares."),
        Professional(id="prof-care-001", user_id="user-care-001", council_number="", council_state="SP", council_type="CERTIFICADO", services_offered=CAREGIVER_SERVICES, markup_pct=0, service_radius=20, city="São Paulo", state="SP", latitude=-23.5905, longitude=-46.6733, is_available=True, approval_status=DocStatus.approved, rating_avg=4.8, rating_count=31),
        Professional(id="prof-care-002", user_id="user-care-002", council_number="", council_state="SP", council_type="CERTIFICADO", services_offered=CAREGIVER_SERVICES, markup_pct=0, service_radius=15, city="São Paulo", state="SP", latitude=-23.6005, longitude=-46.6833, is_available=False, approval_status=DocStatus.pending, rating_avg=0.0, rating_count=0),
    ])

    # Seed availability for approved professionals (Mon-Fri 7:00-19:00)
    for prof_id in ["prof-nurse-001","prof-nurse-002","prof-tech-001","prof-assist-001","prof-care-001"]:
        for dow in range(5):  # 0=Mon to 4=Fri
            db.add(Availability(id=f"avail-{prof_id}-{dow}", professional_id=prof_id, type=AvailabilityType.available, is_recurring=True, day_of_week=dow, start_time="07:00", end_time="19:00"))
        # Saturday half day
        db.add(Availability(id=f"avail-{prof_id}-5", professional_id=prof_id, type=AvailabilityType.available, is_recurring=True, day_of_week=5, start_time="07:00", end_time="13:00"))

    db.add_all([
        Patient(id="patient-001", user_id="user-client-001", patient_name="Roberto Mendes", date_of_birth="1948-03-15", age=78, relation="Filho(a)", diagnoses="Diabetes tipo 2, hipertensão arterial", allergies="Penicilina", medications="Metformina 500mg, Losartana 50mg", devices=["catheter"], mobility="ambulatory", address="Rua das Flores, 123, Jardins, São Paulo - SP", latitude=-23.5605, longitude=-46.6433, is_own_account=False, representative_name="Ana Carolina Mendes", representative_relation="Filha", representative_phone="(11) 97654-0001", emergency_contact_name="Dr. Carlos Rodrigues", emergency_contact_phone="(11) 3456-7890", emergency_contact_relation="Médico de família"),
        Patient(id="patient-002", user_id="user-client-002", patient_name="Margarida Costa", date_of_birth="1944-07-22", age=82, relation="Cônjuge", diagnoses="AVC isquêmico, hemiplegia direita", allergies="Dipirona", medications="AAS 100mg, Clopidogrel 75mg", devices=["gastrostomy","catheter"], mobility="bedridden", address="Av. Paulista, 456, Bela Vista, São Paulo - SP", latitude=-23.5705, longitude=-46.6533, is_own_account=False, representative_name="Roberto Alves Costa", representative_relation="Cônjuge", representative_phone="(11) 97654-0002", emergency_contact_name="Dra. Lucia Santos", emergency_contact_phone="(11) 2345-6789", emergency_contact_relation="Neurologista"),
        Patient(id="patient-003", user_id="user-client-003", patient_name="Beatriz Santos", date_of_birth="1981-11-05", age=45, relation="Próprio paciente", diagnoses="Pós-operatório de colecistectomia", allergies="Nenhuma", medications="Dipirona 1g SOS", devices=[], mobility="ambulatory", address="Rua Augusta, 789, Consolação, São Paulo - SP", latitude=-23.5505, longitude=-46.6333, is_own_account=True, emergency_contact_name="Pedro Santos", emergency_contact_phone="(11) 98765-1234", emergency_contact_relation="Irmão"),
    ])
    db.commit()

    db.add_all([
        Booking(id="booking-001", patient_id="patient-001", professional_id="prof-nurse-001", service_type="Cuidado Pós-Hospitalar", services=["Curativo complexo / lesão por pressão","Monitoramento de sinais vitais"], care_level=3, duration_hours=8, shift="day", scheduled_start=now+timedelta(hours=3), scheduled_end=now+timedelta(hours=11), status=BookingStatus.accepted, is_holiday=False, base_price=380.0, markup_pct=10, surcharge_pct=0, total_price=418.0, platform_fee=50.16, pro_payout=367.84),
        Booking(id="booking-002", patient_id="patient-001", professional_id="prof-tech-001", service_type="Cuidado com Idosos", services=["Banho e higiene pessoal","Alimentação assistida"], care_level=1, duration_hours=2, shift="day", scheduled_start=now-timedelta(days=2,hours=3), scheduled_end=now-timedelta(days=2,hours=1), actual_checkin=now-timedelta(days=2,hours=3), actual_checkout=now-timedelta(days=2,hours=1), status=BookingStatus.completed, base_price=120.0, markup_pct=0, surcharge_pct=0, total_price=120.0, platform_fee=14.4, pro_payout=105.6),
        Booking(id="booking-003", patient_id="patient-001", professional_id="prof-nurse-001", service_type="Cuidado de Doença Crônica", services=["Administração de insulina","Glicemia capilar"], care_level=2, duration_hours=2, shift="day", scheduled_start=now-timedelta(days=7), scheduled_end=now-timedelta(days=7)+timedelta(hours=2), actual_checkin=now-timedelta(days=7), actual_checkout=now-timedelta(days=7)+timedelta(hours=2), status=BookingStatus.completed, base_price=180.0, markup_pct=10, surcharge_pct=0, total_price=198.0, platform_fee=23.76, pro_payout=174.24),
        Booking(id="booking-004", patient_id="patient-001", professional_id="prof-care-001", service_type="Cuidado Acompanhante", services=["Acompanhamento / companheirismo","Alimentação assistida"], care_level=1, duration_hours=6, shift="day", scheduled_start=now+timedelta(days=2), scheduled_end=now+timedelta(days=2,hours=6), status=BookingStatus.pending, base_price=140.0, markup_pct=0, surcharge_pct=0, total_price=140.0, platform_fee=16.8, pro_payout=123.2),
        Booking(id="booking-005", patient_id="patient-002", professional_id="prof-nurse-002", service_type="Cuidado Paliativo", services=["Cuidados paliativos","Cuidados com gastrostomia","Monitoramento de sinais vitais"], care_level=3, duration_hours=12, shift="day", scheduled_start=now-timedelta(days=1), scheduled_end=now-timedelta(days=1)+timedelta(hours=12), actual_checkin=now-timedelta(days=1), actual_checkout=now-timedelta(days=1)+timedelta(hours=12), status=BookingStatus.completed, base_price=500.0, markup_pct=20, surcharge_pct=0, total_price=600.0, platform_fee=72.0, pro_payout=528.0),
        Booking(id="booking-006", patient_id="patient-002", professional_id="prof-tech-001", service_type="Cuidado com Idosos", services=["Banho e higiene pessoal","Monitoramento de sinais vitais"], care_level=2, duration_hours=6, shift="day", scheduled_start=now+timedelta(days=1), scheduled_end=now+timedelta(days=1,hours=6), status=BookingStatus.accepted, base_price=170.0, markup_pct=0, surcharge_pct=0, total_price=170.0, platform_fee=20.4, pro_payout=149.6),
        Booking(id="booking-007", patient_id="patient-003", professional_id="prof-nurse-001", service_type="Procedimentos de Enfermagem", services=["Curativo cirúrgico","Avaliação clínica de enfermagem"], care_level=4, duration_hours=2, shift="day", scheduled_start=now-timedelta(days=3), scheduled_end=now-timedelta(days=3)+timedelta(hours=2), actual_checkin=now-timedelta(days=3), actual_checkout=now-timedelta(days=3)+timedelta(hours=2), status=BookingStatus.completed, base_price=180.0, markup_pct=10, surcharge_pct=0, total_price=198.0, platform_fee=23.76, pro_payout=174.24),
        Booking(id="booking-008", patient_id="patient-003", professional_id="prof-nurse-001", service_type="Procedimentos de Enfermagem", services=["Curativo cirúrgico"], care_level=3, duration_hours=2, shift="day", scheduled_start=now+timedelta(days=4), scheduled_end=now+timedelta(days=4,hours=2), status=BookingStatus.pending, base_price=180.0, markup_pct=10, surcharge_pct=0, total_price=198.0, platform_fee=23.76, pro_payout=174.24),
    ])
    db.commit()

    db.add_all([
        Payment(booking_id="booking-002", amount=120.0, commission=14.4, pro_payout=105.6, currency="BRL", method="pix", status=PaymentStatus.released, held_at=now-timedelta(days=2), released_at=now-timedelta(days=2)+timedelta(hours=2)),
        Payment(booking_id="booking-003", amount=198.0, commission=23.76, pro_payout=174.24, currency="BRL", method="credit_card", status=PaymentStatus.released, held_at=now-timedelta(days=7), released_at=now-timedelta(days=7)+timedelta(hours=2)),
        Payment(booking_id="booking-005", amount=600.0, commission=72.0, pro_payout=528.0, currency="BRL", method="pix", status=PaymentStatus.released, held_at=now-timedelta(days=1), released_at=now-timedelta(days=1)+timedelta(hours=12)),
        Payment(booking_id="booking-007", amount=198.0, commission=23.76, pro_payout=174.24, currency="BRL", method="debit_card", status=PaymentStatus.released, held_at=now-timedelta(days=3), released_at=now-timedelta(days=3)+timedelta(hours=1)),
        Payment(booking_id="booking-001", amount=418.0, commission=50.16, pro_payout=367.84, currency="BRL", method="pix", status=PaymentStatus.held, held_at=now-timedelta(hours=2)),
    ])
    db.add_all([
        Assessment(booking_id="booking-002", reviewer_id="user-client-001", reviewee_id="user-tech-001", rating=5, comment="João foi muito atencioso e pontual."),
        Assessment(booking_id="booking-003", reviewer_id="user-client-001", reviewee_id="user-nurse-001", rating=5, comment="Maria é excelente, muito cuidadosa."),
        Assessment(booking_id="booking-005", reviewer_id="user-client-002", reviewee_id="user-nurse-002", rating=5, comment="Patricia demonstrou muito preparo."),
        Assessment(booking_id="booking-007", reviewer_id="user-client-003", reviewee_id="user-nurse-001", rating=4, comment="Muito boa profissional, pontual."),
    ])
    db.add_all([
        Document(user_id="user-nurse-001", doc_type="photo_id", file_url="https://placeholder.com/doc1.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="diploma",  file_url="https://placeholder.com/doc2.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="criminal", file_url="https://placeholder.com/doc3.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="selfie",   file_url="https://placeholder.com/doc4.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-002", doc_type="photo_id", file_url="https://placeholder.com/doc5.jpg", status=DocStatus.approved),
        Document(user_id="user-care-002",  doc_type="photo_id", file_url="https://placeholder.com/doc9.jpg", status=DocStatus.pending),
    ])
    db.commit()

    return {
        "status": "✅ seeded",
        "accounts": {
            "admin":       ["admin@cuida.me / admin123", "admin2@cuida.me / admin123"],
            "clients":     ["cliente@cuida.me / client123", "cliente2@cuida.me / client123", "cliente3@cuida.me / client123"],
            "nurses":             ["enfermeira@cuida.me / pro123 (approved)", "enfermeira2@cuida.me / pro123 (approved)"],
            "technicians":        ["tecnico@cuida.me / pro123 (approved)", "tecnico2@cuida.me / pro123 (approved)"],
            "nursing_assistants": ["auxiliar@cuida.me / pro123 (approved)"],
            "caregivers":         ["cuidadora@cuida.me / pro123 (approved)", "cuidadora2@cuida.me / pro123 (PENDING)"],
        },
        "new_features": ["availability calendar seeded", "representative fields seeded", "escrow payments seeded", "4-level service catalog"]
    }