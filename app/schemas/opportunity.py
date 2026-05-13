from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# Opportunity Schemas
class OpportunityBase(BaseModel):
    opportunity_number: str
    title: str
    agency: str
    category: str
    description: str
    closing_date: datetime
    posted_date: datetime
    award_amount: str
    funding_types: List[str]
    eligibility: str
    url: str

class OpportunityCreate(OpportunityBase):
    pass

class OpportunityResponse(OpportunityBase):
    id: int
    source: str
    last_updated: datetime
    created_at: datetime

    class Config:
        from_attributes = True