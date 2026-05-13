from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# Application Schemas
class ApplicationBase(BaseModel):
    opportunity_number: str
    application_data: dict  # Form data for the grant application
    documents: Optional[list] = None  # List of document URLs
    notes: Optional[str] = None

class ApplicationCreate(ApplicationBase):
    pass

class ApplicationUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class ApplicationResponse(ApplicationBase):
    id: int
    entity_name: str
    submitted_at: Optional[datetime]
    status: str
    created_at: datetime
    updated_at: datetime
    opportunity_title: str

    class Config:
        from_attributes = True