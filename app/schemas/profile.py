from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import List, Optional

# Profile Schemas
class ProfileBase(BaseModel):
    duns_number: str
    entity_name: str
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    country: str = "USA"
    phone: str
    email: EmailStr

class ProfileCreate(ProfileBase):
    sam_api_key: Optional[str] = None

class ProfileUpdate(BaseModel):
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

class ProfileResponse(ProfileBase):
    id: int
    sam_status: str
    naics_codes: Optional[List[str]] = None
    psc_codes: Optional[List[str]] = None
    certifications: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True