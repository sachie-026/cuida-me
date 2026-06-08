"""
Seed script — run once to populate local dev database.

Usage:
  cd backend
  python seed.py
"""

import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models.models import (
    Base, User, UserRole, Professional, Patient,
    Document, Booking, Payment, Assessment,
    DocStatus, BookingStatus, PaymentStatus
)
from datetime import datetime, timedelta

Base.metadata.create_all(bind=engine)
db = SessionLocal()

def seed():
    print("🌱 Seeding database...")

    # ── Clear existing data ──
    for model in [Assessment, Payment, Booking, Document, Professional, Patient, User]:
        db.query(model).delete()
    db.commit()

    # ── Dummy User 1: Admin / Client (full access) ──
    admin = User(
        id="user-admin-001",
        email="admin@cuida.me",
        password_hash=hash_password("admin123"),
        full_name="Admin Teste",
        phone="(11) 99999-0001",
        cpf="000.000.000-01",
        role=UserRole.client,
        is_active=True,
        is_verified=True,
        country_code="BR",
        language="pt-BR",
    )

    # ── Dummy User 2: Professional (full access) ──
    pro_user = User(
        id="user-pro-001",
        email="enfermeira@cuida.me",
        password_hash=hash_password("pro123"),
        full_name="Maria Santos",
        phone="(11) 99999-0002",
        cpf="000.000.000-02",
        role=UserRole.nurse,
        is_active=True,
        is_verified=True,
        country_code="BR",
        language="pt-BR",
    )

    db.add_all([admin, pro_user])
    db.commit()

    # ── Professional profile for pro_user ──
    professional = Professional(
        id="prof-001",
        user_id="user-pro-001",
        council_number="123456",
        council_state="SP",
        council_type="COREN",
        specialties=["Cuidados domiciliares gerais", "Pós-operatório / curativos", "Cuidados com idosos"],
        service_radius=20,
        city="São Paulo",
        state="SP",
        latitude=-23.5505,
        longitude=-46.6333,
        hourly_rate=120.0,
        is_available=True,
        approval_status=DocStatus.approved,
        rating_avg=4.9,
        rating_count=87,
    )
    db.add(professional)

    # ── Patient linked to admin user ──
    patient = Patient(
        id="patient-001",
        user_id="user-admin-001",
        patient_name="João Teste",
        age=75,
        relation="Filho(a)",
        diagnoses="Diabetes tipo 2, hipertensão arterial",
        allergies="Penicilina",
        medications="Metformina 500mg, Losartana 50mg",
        devices=["catheter"],
        mobility="ambulatory",
        address="Rua das Flores, 123, Jardins, São Paulo - SP",
        latitude=-23.5605,
        longitude=-46.6433,
    )
    db.add(patient)
    db.commit()

    # ── Documents for professional ──
    docs = [
        Document(user_id="user-pro-001", doc_type="photo_id",  file_url="https://placeholder.com/doc1.jpg", status=DocStatus.approved),
        Document(user_id="user-pro-001", doc_type="diploma",   file_url="https://placeholder.com/doc2.jpg", status=DocStatus.approved),
        Document(user_id="user-pro-001", doc_type="criminal",  file_url="https://placeholder.com/doc3.jpg", status=DocStatus.approved),
        Document(user_id="user-pro-001", doc_type="selfie",    file_url="https://placeholder.com/doc4.jpg", status=DocStatus.approved),
    ]
    db.add_all(docs)

    # ── Dummy bookings ──
    now = datetime.utcnow()

    booking1 = Booking(
        id="booking-001",
        patient_id="patient-001",
        professional_id="prof-001",
        service_type="Curativo complexo",
        procedures=["Troca de curativo", "Monitoramento de sinais vitais"],
        scheduled_start=now + timedelta(hours=2),
        scheduled_end=now + timedelta(hours=5),
        status=BookingStatus.accepted,
        total_price=360.0,
        platform_fee=43.20,   # 12% commission
        pro_payout=316.80,
        notes="Paciente com mobilidade reduzida. Usar luvas extra.",
    )

    booking2 = Booking(
        id="booking-002",
        patient_id="patient-001",
        professional_id="prof-001",
        service_type="Banho no leito",
        procedures=["Banho no leito", "Higiene oral"],
        scheduled_start=now - timedelta(days=1, hours=3),
        scheduled_end=now - timedelta(days=1, hours=1),
        actual_checkin=now - timedelta(days=1, hours=3),
        actual_checkout=now - timedelta(days=1, hours=1),
        checkin_lat=-23.5605,
        checkin_lng=-46.6433,
        status=BookingStatus.completed,
        total_price=240.0,
        platform_fee=28.80,
        pro_payout=211.20,
    )

    booking3 = Booking(
        id="booking-003",
        patient_id="patient-001",
        professional_id="prof-001",
        service_type="Administração de medicamentos",
        procedures=["Administração de medicamentos", "Verificação de pressão"],
        scheduled_start=now - timedelta(days=5),
        scheduled_end=now - timedelta(days=5) + timedelta(hours=1),
        status=BookingStatus.completed,
        total_price=120.0,
        platform_fee=14.40,
        pro_payout=105.60,
    )

    db.add_all([booking1, booking2, booking3])
    db.commit()

    # ── Payments for completed bookings ──
    payment2 = Payment(
        booking_id="booking-002",
        amount=240.0,
        commission=28.80,
        pro_payout=211.20,
        currency="BRL",
        method="pix",
        status=PaymentStatus.paid,
        paid_at=now - timedelta(days=1),
    )
    payment3 = Payment(
        booking_id="booking-003",
        amount=120.0,
        commission=14.40,
        pro_payout=105.60,
        currency="BRL",
        method="card",
        status=PaymentStatus.paid,
        paid_at=now - timedelta(days=5),
    )
    db.add_all([payment2, payment3])

    # ── Assessments for completed bookings ──
    assessment1 = Assessment(
        booking_id="booking-002",
        reviewer_id="user-admin-001",
        reviewee_id="user-pro-001",
        rating=5,
        comment="Excelente profissional, muito atenciosa e pontual.",
    )
    assessment2 = Assessment(
        booking_id="booking-003",
        reviewer_id="user-admin-001",
        reviewee_id="user-pro-001",
        rating=5,
        comment="Ótimo atendimento, recomendo.",
    )
    db.add_all([assessment1, assessment2])
    db.commit()

    print("\n✅ Seed complete!\n")
    print("=" * 40)
    print("👤 CLIENT / ADMIN USER")
    print("   Email   : admin@cuida.me")
    print("   Password: admin123")
    print()
    print("👩‍⚕️ PROFESSIONAL USER")
    print("   Email   : enfermeira@cuida.me")
    print("   Password: pro123")
    print("=" * 40)
    print("\n3 bookings, 2 payments, 2 assessments seeded.")

if __name__ == "__main__":
    seed()
    db.close()