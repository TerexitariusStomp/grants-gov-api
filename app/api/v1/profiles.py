from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.base import Profile
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse
from app.services.sam import SAMService
from app.auth import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/api/v1/profiles", tags=["Profiles"])

# Initialize SAM service
sam_service = SAMService(api_key=settings.sam_api_key)

@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    profile: ProfileCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new business profile for grant applications.
    """
    # Check if DUNS already exists
    existing = db.query(Profile).filter(Profile.duns_number == profile.duns_number).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile with this DUNS number already exists"
        )
    
    # Get SAM status
    sam_status = sam_service.get_sam_status(profile.duns_number)
    
    # Create profile
    db_profile = Profile(
        duns_number=profile.duns_number,
        entity_name=profile.entity_name,
        address_line_1=profile.address_line_1,
        address_line_2=profile.address_line_2,
        city=profile.city,
        state=profile.state,
        zip_code=profile.zip_code,
        country=profile.country,
        phone=profile.phone,
        email=profile.email,
        sam_status=sam_status,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    
    return db_profile

@router.get("/", response_model=List[ProfileResponse])
async def get_profiles(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=100)
):
    """
    List all business profiles.
    """
    profiles = db.query(Profile).offset(skip).limit(limit).all()
    return profiles

@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific business profile.
    """
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )
    return profile

@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: int,
    profile_update: ProfileUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a business profile.
    """
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )
    
    # Update fields
    update_data = profile_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    
    profile.updated_at = datetime.now()
    db.commit()
    db.refresh(profile)
    
    return profile

@router.get("/sam-status/{duns_number}")
async def check_sam_status(
    duns_number: str,
    db: Session = Depends(get_db)
):
    """
    Check SAM registration status for a DUNS number.
    """
    # First check local cache
    cached_profile = db.query(Profile).filter(Profile.duns_number == duns_number).first()
    if cached_profile:
        return {
            "duns_number": duns_number,
            "entity_name": cached_profile.entity_name,
            "sam_status": cached_profile.sam_status,
            "last_updated": cached_profile.updated_at
        }
    
    # Otherwise fetch from SAM
    sam_status = sam_service.get_sam_status(duns_number)
    
    return {
        "duns_number": duns_number,
        "sam_status": sam_status,
        "last_updated": datetime.now()
    }

@router.get("/sync-sam/{profile_id}")
async def sync_sam_status(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """
    Sync SAM status for a specific profile.
    """
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )
    
    # Get fresh SAM status
    sam_status = sam_service.get_sam_status(profile.duns_number)
    
    # Update profile
    profile.sam_status = sam_status
    profile.updated_at = datetime.now()
    db.commit()
    db.refresh(profile)
    
    return profile