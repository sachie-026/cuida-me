from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine
from app.routes import auth, professionals, bookings, admin, ratings, users

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Cuida.me API",
    description="Home care platform API",
    version="1.0.0",
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

@app.get("/")
def root():
    return {"message": "Cuida.me API is running 🩺", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "ok"}