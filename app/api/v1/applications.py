from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.base import Application, Profile, Opportunity
from app.schemas.application import ApplicationUpdate, ApplicationResponse
from app.auth import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/api/v1/applications", tags=["Applications"])

@router.get("/", response_model=List[ApplicationResponse])
async def get_applications(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    """
    List all grant applications, optionally filtered by status.
    """
    query = db.query(Application)
    
    if status_filter:
        query = query.filter(Application.status == status_filter)
    
    applications = query.offset(skip).limit(limit).all()
    return applications

@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: int,
    db: Session = Depends(get_db)
):
    """
    Get details of a specific grant application.
    """
    application = db.query(Application).filter(
        Application.id == application_id
    ).first()
    
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found"
        )
    
    return application

@router.put("/{application_id}/status", response_model=ApplicationResponse)
async def update_application_status(
    application_id: int,
    update: ApplicationUpdate,
    db: Session = Depends(get_db)
):
    """
    Update the status of an application (for admin use).
    """
    application = db.query(Application).filter(
        Application.id == application_id
    ).first()
    
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found"
        )
    
    # Update status and notes
    if update.status:
        application.status = update.status
    if update.notes:
        application.notes = update.notes
    
    application.updated_at = datetime.now()
    db.commit()
    db.refresh(application)
    
    return application

@router.get("/profile/{profile_id}")
async def get_applications_by_profile(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all applications submitted by a specific profile.
    """
    applications = db.query(Application).filter(
        Application.profile_id == profile_id
    ).all()
    
    return applications