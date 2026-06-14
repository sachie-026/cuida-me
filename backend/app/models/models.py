from sqlalchemy import Column, String, Integer, Boolean, Float, DateTime, ForeignKey, Enum, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum, uuid

def gen_uuid():
    return str(uuid.uuid4())

class UserRole(str, enum.Enum):
    client      = "client"
    nurse       = "nurse"
    technician  = "technician"
    caregiver   = "caregiver"
    admin       = "admin"  # ← added

class DocStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"

class BookingStatus(str, enum.Enum):
    pending    = "pending"
    accepted   = "accepted"
    checked_in = "checked_in"
    completed  = "completed"
    cancelled  = "cancelled"

class PaymentStatus(str, enum.Enum):
    pending  = "pending"
    paid     = "paid"
    refunded = "refunded"
    failed   = "failed"

class User(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True, default=gen_uuid)
    email         = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True)
    full_name     = Column(String, nullable=False)
    phone         = Column(String, nullable=True)
    cpf           = Column(String, unique=True, nullable=True)
    role          = Column(Enum(UserRole), nullable=False)
    is_active     = Column(Boolean, default=True)
    is_verified   = Column(Boolean, default=False)
    google_id     = Column(String, unique=True, nullable=True)
    country_code  = Column(String, default="BR")
    language      = Column(String, default="pt-BR")
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    professional  = relationship("Professional", back_populates="user", uselist=False)
    patient       = relationship("Patient",      back_populates="user", uselist=False)
    documents     = relationship("Document",     back_populates="user")

class Professional(Base):
    __tablename__ = "professionals"
    id             = Column(String, primary_key=True, default=gen_uuid)
    user_id        = Column(String, ForeignKey("users.id"), unique=True)
    council_number = Column(String, nullable=True)
    council_state  = Column(String, nullable=True)
    council_type   = Column(String, default="COREN")
    specialties    = Column(JSON, default=list)
    service_radius = Column(Integer, default=15)
    city           = Column(String, nullable=True)
    state          = Column(String, nullable=True)
    latitude       = Column(Float, nullable=True)
    longitude      = Column(Float, nullable=True)
    hourly_rate    = Column(Float, nullable=True)
    is_available   = Column(Boolean, default=False)
    approval_status= Column(Enum(DocStatus), default=DocStatus.pending)
    rating_avg     = Column(Float, default=0.0)
    rating_count   = Column(Integer, default=0)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    user     = relationship("User",    back_populates="professional")
    bookings = relationship("Booking", back_populates="professional")

class Patient(Base):
    __tablename__ = "patients"
    id           = Column(String, primary_key=True, default=gen_uuid)
    user_id      = Column(String, ForeignKey("users.id"))
    patient_name = Column(String, nullable=False)
    age          = Column(Integer, nullable=True)
    relation     = Column(String, nullable=True)
    diagnoses    = Column(Text,   nullable=True)
    allergies    = Column(Text,   nullable=True)
    medications  = Column(Text,   nullable=True)
    devices      = Column(JSON,   default=list)
    mobility     = Column(String, nullable=True)
    address      = Column(Text,   nullable=True)
    latitude     = Column(Float,  nullable=True)
    longitude    = Column(Float,  nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    user     = relationship("User",    back_populates="patient")
    bookings = relationship("Booking", back_populates="patient")

class Document(Base):
    __tablename__ = "documents"
    id          = Column(String, primary_key=True, default=gen_uuid)
    user_id     = Column(String, ForeignKey("users.id"))
    doc_type    = Column(String)
    file_url    = Column(String)
    status      = Column(Enum(DocStatus), default=DocStatus.pending)
    reviewed_by = Column(String, nullable=True)
    notes       = Column(Text,   nullable=True)
    expires_at  = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="documents")

class Booking(Base):
    __tablename__ = "bookings"
    id              = Column(String, primary_key=True, default=gen_uuid)
    patient_id      = Column(String, ForeignKey("patients.id"))
    professional_id = Column(String, ForeignKey("professionals.id"))
    service_type    = Column(String)
    procedures      = Column(JSON, default=list)
    scheduled_start = Column(DateTime(timezone=True))
    scheduled_end   = Column(DateTime(timezone=True))
    actual_checkin  = Column(DateTime(timezone=True), nullable=True)
    actual_checkout = Column(DateTime(timezone=True), nullable=True)
    checkin_lat     = Column(Float, nullable=True)
    checkin_lng     = Column(Float, nullable=True)
    status          = Column(Enum(BookingStatus), default=BookingStatus.pending)
    total_price     = Column(Float)
    platform_fee    = Column(Float)
    pro_payout      = Column(Float)
    notes           = Column(Text, nullable=True)
    cancel_reason   = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    patient      = relationship("Patient",      back_populates="bookings")
    professional = relationship("Professional", back_populates="bookings")
    payment      = relationship("Payment",      back_populates="booking", uselist=False)
    assessments  = relationship("Assessment",   back_populates="booking")

class Payment(Base):
    __tablename__ = "payments"
    id               = Column(String, primary_key=True, default=gen_uuid)
    booking_id       = Column(String, ForeignKey("bookings.id"), unique=True)
    amount           = Column(Float)
    commission       = Column(Float)
    pro_payout       = Column(Float)
    currency         = Column(String, default="BRL")
    method           = Column(String)
    stripe_intent_id = Column(String, nullable=True)
    status           = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    paid_at          = Column(DateTime(timezone=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    booking = relationship("Booking", back_populates="payment")

class Assessment(Base):
    __tablename__ = "assessments"
    id          = Column(String, primary_key=True, default=gen_uuid)
    booking_id  = Column(String, ForeignKey("bookings.id"))
    reviewer_id = Column(String, ForeignKey("users.id"))
    reviewee_id = Column(String, ForeignKey("users.id"))
    rating      = Column(Integer)
    comment     = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    booking = relationship("Booking", back_populates="assessments")

class Occurrence(Base):
    __tablename__ = "occurrences"
    id          = Column(String, primary_key=True, default=gen_uuid)
    booking_id  = Column(String, ForeignKey("bookings.id"), nullable=True)
    user_id     = Column(String, ForeignKey("users.id"))
    type        = Column(String)
    description = Column(Text)
    resolved    = Column(Boolean, default=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())