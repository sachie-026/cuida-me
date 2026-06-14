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
        Booking, Payment, Assessment, Document,
        DocStatus, BookingStatus, PaymentStatus
    )
    from datetime import datetime, timedelta

    now = datetime.utcnow()

    # Clear all
    for model in [Assessment, Payment, Booking, Document, Professional, Patient, User]:
        db.query(model).delete()
    db.commit()

    # ── Admin users ──
    admin1 = User(id="user-admin-001", email="admin@cuida.me",
        password_hash=hash_password("admin123"), full_name="Carlos Eduardo Silva",
        phone="(11) 98765-0001", cpf="111.111.111-01",
        role=UserRole.admin, is_active=True, is_verified=True)
    admin2 = User(id="user-admin-002", email="admin2@cuida.me",
        password_hash=hash_password("admin123"), full_name="Fernanda Lima Souza",
        phone="(11) 98765-0002", cpf="111.111.111-02",
        role=UserRole.admin, is_active=True, is_verified=True)

    # ── Client users ──
    client1 = User(id="user-client-001", email="cliente@cuida.me",
        password_hash=hash_password("client123"), full_name="Ana Carolina Mendes",
        phone="(11) 97654-0001", cpf="222.222.222-01",
        role=UserRole.client, is_active=True, is_verified=True)
    client2 = User(id="user-client-002", email="cliente2@cuida.me",
        password_hash=hash_password("client123"), full_name="Roberto Alves Costa",
        phone="(11) 97654-0002", cpf="222.222.222-02",
        role=UserRole.client, is_active=True, is_verified=True)
    client3 = User(id="user-client-003", email="cliente3@cuida.me",
        password_hash=hash_password("client123"), full_name="Beatriz Santos Ferreira",
        phone="(11) 97654-0003", cpf="222.222.222-03",
        role=UserRole.client, is_active=True, is_verified=True)

    # ── Professional users ──
    nurse1 = User(id="user-nurse-001", email="enfermeira@cuida.me",
        password_hash=hash_password("pro123"), full_name="Maria Santos Oliveira",
        phone="(11) 91234-0001", cpf="333.333.333-01",
        role=UserRole.nurse, is_active=True, is_verified=True)
    nurse2 = User(id="user-nurse-002", email="enfermeira2@cuida.me",
        password_hash=hash_password("pro123"), full_name="Patricia Lima Rodrigues",
        phone="(11) 91234-0002", cpf="333.333.333-02",
        role=UserRole.nurse, is_active=True, is_verified=True)
    tech1 = User(id="user-tech-001", email="tecnico@cuida.me",
        password_hash=hash_password("pro123"), full_name="João Lima Costa",
        phone="(11) 92345-0001", cpf="444.444.444-01",
        role=UserRole.technician, is_active=True, is_verified=True)
    tech2 = User(id="user-tech-002", email="tecnico2@cuida.me",
        password_hash=hash_password("pro123"), full_name="André Pereira Nunes",
        phone="(11) 92345-0002", cpf="444.444.444-02",
        role=UserRole.technician, is_active=True, is_verified=True)
    care1 = User(id="user-care-001", email="cuidadora@cuida.me",
        password_hash=hash_password("pro123"), full_name="Luciana Ferreira Dias",
        phone="(11) 93456-0001", cpf="555.555.555-01",
        role=UserRole.caregiver, is_active=True, is_verified=True)
    care2 = User(id="user-care-002", email="cuidadora2@cuida.me",
        password_hash=hash_password("pro123"), full_name="Claudia Moreira Santos",
        phone="(11) 93456-0002", cpf="555.555.555-02",
        role=UserRole.caregiver, is_active=True, is_verified=True)

    db.add_all([admin1, admin2, client1, client2, client3, nurse1, nurse2, tech1, tech2, care1, care2])
    db.commit()

    # ── Professional profiles ──
    db.add_all([
        Professional(id="prof-nurse-001", user_id="user-nurse-001",
            council_number="123456", council_state="SP", council_type="COREN",
            specialties=["Cuidados domiciliares gerais","Pós-operatório / curativos","Cuidados com idosos"],
            service_radius=25, city="São Paulo", state="SP",
            latitude=-23.5505, longitude=-46.6333,
            hourly_rate=150.0, is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.9, rating_count=87),
        Professional(id="prof-nurse-002", user_id="user-nurse-002",
            council_number="789012", council_state="SP", council_type="COREN",
            specialties=["Paciente oncológico","UTI domiciliar","Pós-operatório / curativos"],
            service_radius=20, city="São Paulo", state="SP",
            latitude=-23.5605, longitude=-46.6433,
            hourly_rate=180.0, is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.8, rating_count=52),
        Professional(id="prof-tech-001", user_id="user-tech-001",
            council_number="654321", council_state="SP", council_type="COREN",
            specialties=["Cuidados domiciliares gerais","Paciente oncológico"],
            service_radius=15, city="São Paulo", state="SP",
            latitude=-23.5705, longitude=-46.6533,
            hourly_rate=100.0, is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.7, rating_count=43),
        Professional(id="prof-tech-002", user_id="user-tech-002",
            council_number="345678", council_state="SP", council_type="COREN",
            specialties=["Cuidados com idosos","Cuidados domiciliares gerais"],
            service_radius=20, city="São Paulo", state="SP",
            latitude=-23.5805, longitude=-46.6633,
            hourly_rate=90.0, is_available=False, approval_status=DocStatus.approved,
            rating_avg=4.6, rating_count=28),
        Professional(id="prof-care-001", user_id="user-care-001",
            council_number="", council_state="SP", council_type="CERTIFICADO",
            specialties=["Cuidados com idosos","Acompanhamento / companheirismo"],
            service_radius=20, city="São Paulo", state="SP",
            latitude=-23.5905, longitude=-46.6733,
            hourly_rate=70.0, is_available=True, approval_status=DocStatus.approved,
            rating_avg=4.8, rating_count=31),
        Professional(id="prof-care-002", user_id="user-care-002",
            council_number="", council_state="SP", council_type="CERTIFICADO",
            specialties=["Cuidados com idosos","Acompanhamento / companheirismo"],
            service_radius=15, city="São Paulo", state="SP",
            latitude=-23.6005, longitude=-46.6833,
            hourly_rate=65.0, is_available=True, approval_status=DocStatus.pending,
            rating_avg=0.0, rating_count=0),
    ])

    # ── Patients ──
    db.add_all([
        Patient(id="patient-001", user_id="user-client-001",
            patient_name="Roberto Mendes", age=78, relation="Filho(a)",
            diagnoses="Diabetes tipo 2, hipertensão arterial, mobilidade reduzida",
            allergies="Penicilina, AAS",
            medications="Metformina 500mg 2x/dia, Losartana 50mg 1x/dia",
            devices=["catheter"], mobility="ambulatory",
            address="Rua das Flores, 123, Jardins, São Paulo - SP",
            latitude=-23.5605, longitude=-46.6433),
        Patient(id="patient-002", user_id="user-client-002",
            patient_name="Margarida Costa", age=82, relation="Cônjuge",
            diagnoses="AVC isquêmico, hemiplegia direita, disfagia",
            allergies="Dipirona",
            medications="AAS 100mg, Clopidogrel 75mg, Atorvastatina 40mg",
            devices=["gastrostomy","catheter"], mobility="bedridden",
            address="Av. Paulista, 456, Bela Vista, São Paulo - SP",
            latitude=-23.5705, longitude=-46.6533),
        Patient(id="patient-003", user_id="user-client-003",
            patient_name="Beatriz Santos", age=45, relation="Próprio paciente",
            diagnoses="Pós-operatório de colecistectomia laparoscópica",
            allergies="Nenhuma conhecida",
            medications="Dipirona 1g SOS, Omeprazol 20mg",
            devices=[], mobility="ambulatory",
            address="Rua Augusta, 789, Consolação, São Paulo - SP",
            latitude=-23.5505, longitude=-46.6333),
    ])
    db.commit()

    # ── Bookings ──
    db.add_all([
        Booking(id="booking-001", patient_id="patient-001", professional_id="prof-nurse-001",
            service_type="Curativo complexo",
            procedures=["Troca de curativo","Monitoramento de sinais vitais"],
            scheduled_start=now + timedelta(hours=3),
            scheduled_end=now + timedelta(hours=6),
            status=BookingStatus.accepted,
            total_price=450.0, platform_fee=54.0, pro_payout=396.0,
            notes="Curativo pós-cirurgia joelho direito."),
        Booking(id="booking-002", patient_id="patient-001", professional_id="prof-tech-001",
            service_type="Banho no leito e higiene",
            procedures=["Banho no leito","Higiene oral","Troca de roupa de cama"],
            scheduled_start=now - timedelta(days=2, hours=3),
            scheduled_end=now - timedelta(days=2, hours=1),
            actual_checkin=now - timedelta(days=2, hours=3),
            actual_checkout=now - timedelta(days=2, hours=1),
            checkin_lat=-23.5605, checkin_lng=-46.6433,
            status=BookingStatus.completed,
            total_price=200.0, platform_fee=24.0, pro_payout=176.0),
        Booking(id="booking-003", patient_id="patient-001", professional_id="prof-nurse-001",
            service_type="Administração de medicamentos",
            procedures=["Administração de medicamentos","Glicemia capilar","Verificação de pressão"],
            scheduled_start=now - timedelta(days=7),
            scheduled_end=now - timedelta(days=7) + timedelta(hours=2),
            actual_checkin=now - timedelta(days=7),
            actual_checkout=now - timedelta(days=7) + timedelta(hours=2),
            status=BookingStatus.completed,
            total_price=300.0, platform_fee=36.0, pro_payout=264.0),
        Booking(id="booking-004", patient_id="patient-001", professional_id="prof-care-001",
            service_type="Acompanhamento / companheirismo",
            procedures=["Acompanhamento","Alimentação assistida"],
            scheduled_start=now + timedelta(days=2),
            scheduled_end=now + timedelta(days=2, hours=4),
            status=BookingStatus.pending,
            total_price=280.0, platform_fee=33.6, pro_payout=246.4),
        Booking(id="booking-005", patient_id="patient-002", professional_id="prof-nurse-002",
            service_type="Cuidados UTI domiciliar",
            procedures=["Aspiração de traqueostomia","Troca de sonda","Monitoramento"],
            scheduled_start=now - timedelta(days=1),
            scheduled_end=now - timedelta(days=1) + timedelta(hours=12),
            actual_checkin=now - timedelta(days=1),
            actual_checkout=now - timedelta(days=1) + timedelta(hours=12),
            status=BookingStatus.completed,
            total_price=2160.0, platform_fee=259.2, pro_payout=1900.8),
        Booking(id="booking-006", patient_id="patient-002", professional_id="prof-tech-001",
            service_type="Banho no leito e higiene",
            procedures=["Banho no leito","Mudança de decúbito"],
            scheduled_start=now + timedelta(days=1),
            scheduled_end=now + timedelta(days=1, hours=3),
            status=BookingStatus.accepted,
            total_price=300.0, platform_fee=36.0, pro_payout=264.0),
        Booking(id="booking-007", patient_id="patient-003", professional_id="prof-nurse-001",
            service_type="Curativo / pós-operatório",
            procedures=["Troca de curativo cirúrgico","Avaliação da ferida"],
            scheduled_start=now - timedelta(days=3),
            scheduled_end=now - timedelta(days=3) + timedelta(hours=1),
            actual_checkin=now - timedelta(days=3),
            actual_checkout=now - timedelta(days=3) + timedelta(hours=1),
            status=BookingStatus.completed,
            total_price=150.0, platform_fee=18.0, pro_payout=132.0),
        Booking(id="booking-008", patient_id="patient-003", professional_id="prof-nurse-001",
            service_type="Curativo / pós-operatório",
            procedures=["Troca de curativo cirúrgico"],
            scheduled_start=now + timedelta(days=4),
            scheduled_end=now + timedelta(days=4, hours=1),
            status=BookingStatus.pending,
            total_price=150.0, platform_fee=18.0, pro_payout=132.0),
    ])
    db.commit()

    # ── Payments ──
    db.add_all([
        Payment(booking_id="booking-002", amount=200.0,  commission=24.0,  pro_payout=176.0,  currency="BRL", method="pix",  status=PaymentStatus.paid, paid_at=now - timedelta(days=2)),
        Payment(booking_id="booking-003", amount=300.0,  commission=36.0,  pro_payout=264.0,  currency="BRL", method="card", status=PaymentStatus.paid, paid_at=now - timedelta(days=7)),
        Payment(booking_id="booking-005", amount=2160.0, commission=259.2, pro_payout=1900.8, currency="BRL", method="pix",  status=PaymentStatus.paid, paid_at=now - timedelta(days=1)),
        Payment(booking_id="booking-007", amount=150.0,  commission=18.0,  pro_payout=132.0,  currency="BRL", method="card", status=PaymentStatus.paid, paid_at=now - timedelta(days=3)),
    ])

    # ── Assessments ──
    db.add_all([
        Assessment(booking_id="booking-002", reviewer_id="user-client-001", reviewee_id="user-tech-001",  rating=5, comment="João foi muito atencioso e pontual. Recomendo!"),
        Assessment(booking_id="booking-003", reviewer_id="user-client-001", reviewee_id="user-nurse-001", rating=5, comment="Maria é excelente, muito cuidadosa e técnica."),
        Assessment(booking_id="booking-005", reviewer_id="user-client-002", reviewee_id="user-nurse-002", rating=5, comment="Patricia demonstrou muito preparo para casos complexos."),
        Assessment(booking_id="booking-007", reviewer_id="user-client-003", reviewee_id="user-nurse-001", rating=4, comment="Muito boa profissional, pontual e eficiente."),
        Assessment(booking_id="booking-002", reviewer_id="user-tech-001",   reviewee_id="user-client-001", rating=5, comment="Família muito organizada e colaborativa."),
        Assessment(booking_id="booking-003", reviewer_id="user-nurse-001",  reviewee_id="user-client-001", rating=5, comment="Informações do paciente muito bem documentadas."),
    ])

    # ── Documents ──
    db.add_all([
        Document(user_id="user-nurse-001", doc_type="photo_id", file_url="https://placeholder.com/doc1.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-001", doc_type="diploma",  file_url="https://placeholder.com/doc2.jpg", status=DocStatus.approved),
        Document(user_id="user-nurse-002", doc_type="photo_id", file_url="https://placeholder.com/doc3.jpg", status=DocStatus.approved),
        Document(user_id="user-care-002",  doc_type="photo_id", file_url="https://placeholder.com/doc4.jpg", status=DocStatus.pending),
    ])
    db.commit()

    return {
        "status": "✅ seeded",
        "accounts": {
            "admin":       ["admin@cuida.me / admin123", "admin2@cuida.me / admin123"],
            "clients":     ["cliente@cuida.me / client123", "cliente2@cuida.me / client123", "cliente3@cuida.me / client123"],
            "nurses":      ["enfermeira@cuida.me / pro123", "enfermeira2@cuida.me / pro123"],
            "technicians": ["tecnico@cuida.me / pro123", "tecnico2@cuida.me / pro123"],
            "caregivers":  ["cuidadora@cuida.me / pro123", "cuidadora2@cuida.me / pro123 (PENDING — test admin approval)"],
        },
        "data": "3 patients, 8 bookings, 4 payments, 6 ratings, 4 documents"
    }