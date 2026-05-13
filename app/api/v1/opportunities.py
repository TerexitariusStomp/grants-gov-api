from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List
from datetime import datetime
from sqlalchemy.orm import Session
from app.schemas.opportunity import OpportunityResponse
from app.services.grants_dot_gov import GrantsGovService
from app.database import get_db

router = APIRouter(prefix="/api/v1/opportunities", tags=["Opportunities"])

grants_service = GrantsGovService()

@router.get("/", response_model=List[OpportunityResponse])
async def search_opportunities(
    query: str = None,
    agency: str = None,
    category: str = None,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    opportunities = grants_service.search_opportunities({
        'query': query,
        'agency': agency,
        'category': category,
        'limit': limit,
    })
    return opportunities