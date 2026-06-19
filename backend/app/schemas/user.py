from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class UserResponse(BaseModel):
    id:          str
    email:       str
    full_name:   str
    phone:       Optional[str] = None
    cpf:         Optional[str] = None
    role:        str
    is_active:   bool
    is_verified: bool
    google_id:   Optional[str] = None
    country_code:str
    language:    str
    created_at:  Optional[datetime] = None
    updated_at:  Optional[datetime] = None

    class Config:
        from_attributes = True