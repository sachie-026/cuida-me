from sqlalchemy import Column, String, Integer, Boolean, Float, DateTime, Date, Time, ForeignKey, Enum, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum, uuid

def gen_uuid():
    return str(uuid.uuid4())

class UserRole(str, enum.Enum):
    client            = "client"
    nurse             = "nurse"
    technician        = "technician"
    nursing_assistant = "nursing_assistant"
    caregiver         = "caregiver"
    admin      = "admin"

class DocStatus(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    rejected = "rejected"

class BookingStatus(str, enum.Enum):
    pending              = "pending"        # waiting for a professional to accept
    accepted             = "accepted"       # professional accepted (confirmed)
    professional_arrived = "professional_arrived"  # GPS check-in done, waiting to start
    checked_in           = "checked_in"     # in progress (service started)
    completed            = "completed"      # service finished
    cancelled            = "cancelled"      # cancelled by client or professional
    no_show              = "no_show"        # client or professional no-show (use who field)
    under_review         = "under_review"   # paused for admin review (use review_type field)

class PaymentStatus(str, enum.Enum):
    pending           = "pending"           # awaiting payment
    authorized        = "authorized"        # pre-auth/hold on card
    received          = "received"          # PIX payment received
    held              = "held"              # escrow — held by platform
    on_hold           = "on_hold"           # dispute or fraud review
    released          = "released"          # paid out to professional
    refunded          = "refunded"          # full refund
    partially_refunded = "partially_refunded"
    failed            = "failed"

class AvailabilityType(str, enum.Enum):
    available = "available"
    blocked   = "blocked"

class User(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True, default=gen_uuid)
    email         = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True)
    full_name     = Column(String, nullable=False)
    phone         = Column(String, nullable=True)
    cpf           = Column(String, unique=True, nullable=True)
    date_of_birth = Column(String, nullable=True)   # ISO date string
    role          = Column(Enum(UserRole), nullable=False)
    is_active     = Column(Boolean, default=True)
    account_status = Column(String, default="active")  # active, suspended, banned, deleted
    is_verified    = Column(Boolean, default=False)
    phone_verified = Column(Boolean, default=False)
    phone_status   = Column(String, default="not_verified")  # not_verified, in_progress, verified, failed, expired
    phone_otp_code = Column(String, nullable=True)
    phone_otp_expires = Column(DateTime(timezone=True), nullable=True)
    google_id     = Column(String, unique=True, nullable=True)
    # 45a: Two-tier profile — one User can be both Client and Professional
    roles                  = Column(JSON, default=list)    # ["client","nurse"] — all held roles
    has_client_profile     = Column(Boolean, default=False)
    has_professional_profile = Column(Boolean, default=False)
    # 50c: Admin sub-role (only applies when role=admin)
    admin_role   = Column(String, nullable=True)  # super_admin, finance, support, operations
    country_code  = Column(String, default="BR")
    language      = Column(String, default="pt-BR")
    reliability_score = Column(Integer, default=100)
    client_no_shows   = Column(Integer, default=0)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    professional  = relationship("Professional", back_populates="user", uselist=False)
    patient       = relationship("Patient",      back_populates="user", uselist=False)
    documents     = relationship("Document",     back_populates="user")

class Professional(Base):
    __tablename__    = "professionals"
    id               = Column(String, primary_key=True, default=gen_uuid)
    user_id          = Column(String, ForeignKey("users.id"), unique=True)
    council_number   = Column(String, nullable=True)
    council_state    = Column(String, nullable=True)   # COREN registration state
    activity_state   = Column(String, nullable=True)   # Where pro currently operates
    service_states   = Column(JSON, default=list)       # States eligible for bookings
    # 10.1-10: Extended verification status
    verification_status = Column(String, default="pending_verification")
    # Valid: pending_verification, auto_in_progress, auto_verified, manual_review_required,
    #        additional_docs_required, rejected, reverification_required, approved
    verification_reason = Column(String, nullable=True)
    last_verified_at    = Column(DateTime(timezone=True), nullable=True)
    reverification_due  = Column(DateTime(timezone=True), nullable=True)
    council_type     = Column(String, default="COREN")
    additional_categories = Column(JSON, default=list)
    active_category      = Column(String, nullable=True)  # current working category (e.g. "caregiver" for a nurse)
    category_acceptances = Column(JSON, default=list)  # audit log of category switch acceptances  # e.g. [{"role":"technician","coren":"123456","state":"SP"}]
    category_records     = Column(JSON, default=list)
    services_offered = Column(JSON, default=list)
    markup_pct       = Column(Integer, default=0)
    service_radius   = Column(Integer, default=15)
    city             = Column(String, nullable=True)
    state            = Column(String, nullable=True)
    latitude         = Column(Float, nullable=True)
    longitude        = Column(Float, nullable=True)
    is_available     = Column(Boolean, default=False)
    approval_status  = Column(Enum(DocStatus), default=DocStatus.pending)
    rating_avg       = Column(Float, default=0.0)
    rating_count     = Column(Integer, default=0)
    years_experience = Column(Integer, nullable=True)
    bio              = Column(Text, nullable=True)
    specialties      = Column(JSON, default=list)
    reliability_score = Column(Integer, default=100)  # 0-100, higher is better
    late_cancellations = Column(Integer, default=0)
    no_shows         = Column(Integer, default=0)
    completed_count  = Column(Integer, default=0)
    suspended_until  = Column(DateTime(timezone=True), nullable=True)
    rest_until       = Column(DateTime(timezone=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    user          = relationship("User",         back_populates="professional")
    bookings      = relationship("Booking",      back_populates="professional")
    availability  = relationship("Availability", back_populates="professional")

class Patient(Base):
    __tablename__ = "patients"
    id            = Column(String, primary_key=True, default=gen_uuid)
    user_id       = Column(String, ForeignKey("users.id"))
    # Basic info
    patient_name  = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=True)
    age           = Column(Integer, nullable=True)
    relation      = Column(String, nullable=True)
    # Clinical info
    diagnoses     = Column(Text, nullable=True)
    allergies     = Column(Text, nullable=True)
    medications   = Column(Text, nullable=True)
    mobility      = Column(String, nullable=True)
    communication_needs = Column(Text, nullable=True)
    devices       = Column(JSON, default=list)
    additional_notes = Column(Text, nullable=True)
    # Address
    address       = Column(Text, nullable=True)
    latitude      = Column(Float, nullable=True)
    longitude     = Column(Float, nullable=True)
    # Representative fields (Point 1)
    is_own_account       = Column(Boolean, default=True)   # is patient the account owner?
    representative_name  = Column(String, nullable=True)
    representative_relation = Column(String, nullable=True)
    representative_phone = Column(String, nullable=True)
    # Emergency contact
    emergency_contact_name  = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)
    emergency_contact_relation = Column(String, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

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
    notes       = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    expires_at  = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="documents")

class Availability(Base):
    """Professional availability slots — Point 1: Availability Calendar."""
    __tablename__   = "availability"
    id              = Column(String, primary_key=True, default=gen_uuid)
    professional_id = Column(String, ForeignKey("professionals.id"))
    type            = Column(Enum(AvailabilityType), default=AvailabilityType.available)
    # For recurring slots: day_of_week 0=Mon … 6=Sun
    is_recurring    = Column(Boolean, default=False)
    day_of_week     = Column(Integer, nullable=True)   # 0-6 for recurring
    # For specific date slots
    specific_date   = Column(String, nullable=True)    # ISO date "2026-07-01"
    start_time      = Column(String, nullable=False)   # "08:00"
    end_time        = Column(String, nullable=False)   # "18:00"
    notes           = Column(String, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    professional = relationship("Professional", back_populates="availability")

class Booking(Base):
    __tablename__   = "bookings"
    id              = Column(String, primary_key=True, default=gen_uuid)
    patient_id      = Column(String, ForeignKey("patients.id"))
    professional_id = Column(String, ForeignKey("professionals.id"))
    service_type    = Column(String)
    services        = Column(JSON, default=list)
    care_level      = Column(Integer, nullable=True)   # 1-4
    duration_hours  = Column(Integer, nullable=True)
    shift           = Column(String, default="day")
    scheduled_start = Column(DateTime(timezone=True))
    scheduled_end   = Column(DateTime(timezone=True))
    actual_checkin  = Column(DateTime(timezone=True), nullable=True)
    actual_checkout = Column(DateTime(timezone=True), nullable=True)
    checkin_lat     = Column(Float, nullable=True)
    checkin_lng     = Column(Float, nullable=True)
    status          = Column(Enum(BookingStatus), default=BookingStatus.pending)
    # Pricing
    is_urgent       = Column(Boolean, default=False)
    is_holiday      = Column(Boolean, default=False)
    distance_km     = Column(Float, default=0.0)
    base_price      = Column(Float, nullable=True)
    markup_pct      = Column(Integer, default=0)
    surcharge_pct   = Column(Float, default=0.0)
    pricing_snapshot = Column(JSON, nullable=True)  # 50-37: Full pricing config at booking creation
    total_price     = Column(Float)
    platform_fee    = Column(Float)
    pro_payout      = Column(Float)
    # Cancellation
    notes           = Column(Text, nullable=True)
    cancel_reason   = Column(Text, nullable=True)
    cancelled_by    = Column(String, nullable=True)   # "client" | "professional"
    cancelled_at    = Column(DateTime(timezone=True), nullable=True)
    # Unified status detail fields
    no_show_who     = Column(String, nullable=True)  # "client" or "professional"
    review_type     = Column(String, nullable=True)  # "cancellation","completion","early_termination","gps_exception","serious_complaint"
    # Rescheduling
    reschedule_new_start = Column(DateTime(timezone=True), nullable=True)
    reschedule_new_end   = Column(DateTime(timezone=True), nullable=True)
    reschedule_status    = Column(String, nullable=True)  # requested, accepted, declined
    # Emergency contact for booking
    emergency_name  = Column(String, nullable=True)
    emergency_phone = Column(String, nullable=True)
    # Client confirmation
    client_confirmed_start = Column(Boolean, default=False)
    client_confirmed_end   = Column(Boolean, default=False)
    has_dispute     = Column(Boolean, default=False)
    dispute_reason  = Column(Text, nullable=True)
    # GPS checkout
    checkout_lat    = Column(Float, nullable=True)
    checkout_lng    = Column(Float, nullable=True)
    actual_duration_minutes = Column(Integer, nullable=True)
    checkin_flagged  = Column(Boolean, default=False)
    checkin_distance = Column(Integer, nullable=True)
    # Arrival timer
    arrival_timer_start = Column(DateTime(timezone=True), nullable=True)
    service_started_at  = Column(DateTime(timezone=True), nullable=True)
    late_arrival        = Column(Boolean, default=False)
    late_arrival_count  = Column(Integer, default=0)
    # Early termination
    early_termination = Column(Boolean, default=False)
    early_termination_reason = Column(Text, nullable=True)
    # GPS Exception
    gps_exception_reason   = Column(Text, nullable=True)
    gps_exception_evidence = Column(String, nullable=True)
    # GPS Fraud
    gps_fraud_detected = Column(Boolean, default=False)
    gps_fraud_flags    = Column(JSON, default=list)
    # Service Extension
    extension_new_end       = Column(DateTime(timezone=True), nullable=True)
    extension_requested_by  = Column(String, nullable=True)
    extension_additional_cost = Column(Float, nullable=True)
    extension_status        = Column(String, nullable=True)  # requested, confirmed, declined
    # Smart matching
    match_deadline   = Column(DateTime(timezone=True), nullable=True)
    match_batch      = Column(Integer, nullable=True)
    matched_pro_ids  = Column(JSON, default=list)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    patient      = relationship("Patient",      back_populates="bookings")
    professional = relationship("Professional", back_populates="bookings")
    payment      = relationship("Payment",      back_populates="booking", uselist=False)
    assessments  = relationship("Assessment",   back_populates="booking")

class Payment(Base):
    __tablename__    = "payments"
    id               = Column(String, primary_key=True, default=gen_uuid)
    booking_id       = Column(String, ForeignKey("bookings.id"), unique=True)
    amount           = Column(Float)
    commission       = Column(Float)
    pro_payout       = Column(Float)
    currency         = Column(String, default="BRL")
    method           = Column(String, nullable=True)   # "pix" | "credit_card" | "debit_card"
    stripe_intent_id = Column(String, nullable=True)
    pix_code         = Column(String, nullable=True)
    status           = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    held_at          = Column(DateTime(timezone=True), nullable=True)
    released_at      = Column(DateTime(timezone=True), nullable=True)
    refunded_at      = Column(DateTime(timezone=True), nullable=True)
    refund_reason    = Column(String, nullable=True)
    refund_amount    = Column(Float, nullable=True)
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

class HolidayCalendar(Base):
    """Point 3: Automatic holiday detection."""
    __tablename__ = "holidays"
    id          = Column(String, primary_key=True, default=gen_uuid)
    date        = Column(String, nullable=False, index=True)   # "2026-12-25"
    name        = Column(String, nullable=False)
    scope       = Column(String, default="national")   # "national" | "state" | "municipal"
    state       = Column(String, nullable=True)
    city        = Column(String, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

class Message(Base):
    """Point 7: Internal messaging."""
    __tablename__   = "messages"
    id              = Column(String, primary_key=True, default=gen_uuid)
    booking_id      = Column(String, ForeignKey("bookings.id"), nullable=True)
    sender_id       = Column(String, ForeignKey("users.id"))
    recipient_id    = Column(String, ForeignKey("users.id"))
    content         = Column(Text, nullable=False)
    is_read         = Column(Boolean, default=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

class Occurrence(Base):
    __tablename__ = "occurrences"
    id          = Column(String, primary_key=True, default=gen_uuid)
    booking_id  = Column(String, ForeignKey("bookings.id"), nullable=True)
    user_id     = Column(String, ForeignKey("users.id"))
    type        = Column(String)
    description = Column(Text)
    resolved    = Column(Boolean, default=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
class Report(Base):
    """User reports (professional or client) linked to bookings."""
    __tablename__   = "reports"
    id              = Column(String, primary_key=True, default=gen_uuid)
    booking_id      = Column(String, ForeignKey("bookings.id"), nullable=True)
    reporter_id     = Column(String, ForeignKey("users.id"))
    reported_id     = Column(String, ForeignKey("users.id"))
    report_type     = Column(String)  # "professional" or "client"
    reason          = Column(String, nullable=False)
    description     = Column(Text, nullable=True)
    status          = Column(String, default="pending")  # pending, under_review, resolved
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
class AvailabilityAlert(Base):
    """Availability alerts for smart matching — notifies users when compatible opportunities appear."""
    __tablename__   = "availability_alerts"
    id              = Column(String, primary_key=True, default=gen_uuid)
    user_id         = Column(String, ForeignKey("users.id"), nullable=False)
    alert_type      = Column(String, nullable=False)  # "patient" or "professional"
    # Search criteria
    care_type       = Column(String, nullable=True)
    services        = Column(JSON, default=list)
    professional_category = Column(String, nullable=True)  # nurse, technician, etc.
    preferred_date  = Column(String, nullable=True)  # YYYY-MM-DD
    preferred_time  = Column(String, nullable=True)  # HH:MM
    duration_hours  = Column(Integer, nullable=True)
    city            = Column(String, nullable=True)
    state           = Column(String, nullable=True)
    radius_km       = Column(Integer, default=50)
    # Status
    status          = Column(String, default="active")  # active, paused, matched, expired
    matched_at      = Column(DateTime(timezone=True), nullable=True)
    matched_id      = Column(String, nullable=True)  # booking_id or professional_id that matched
    expires_at      = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())
class PlatformSettings(Base):
    """Stores editable platform operating parameters. Single row, key-value."""
    __tablename__ = "platform_settings"
    id          = Column(String, primary_key=True, default="global")
    data        = Column(JSON, default=dict)
    updated_by  = Column(String, nullable=True)
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

class SettingsAuditLog(Base):
    """Audit log for platform settings changes."""
    __tablename__ = "settings_audit_log"
    id          = Column(String, primary_key=True, default=gen_uuid)
    admin_id    = Column(String, nullable=False)
    admin_name  = Column(String, nullable=False)
    field       = Column(String, nullable=False)
    old_value   = Column(String, nullable=True)
    new_value   = Column(String, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())