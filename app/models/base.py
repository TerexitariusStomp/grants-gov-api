from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, Session

Base = declarative_base()

class Profile(Base):
    """Business profile for grant applicants"""
    __tablename__ = "profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    duns_number = Column(String, unique=True, index=True)  # D-U-N-S Number
    entity_name = Column(String)
    address_line_1 = Column(String)
    address_line_2 = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    country = Column(String)
    phone = Column(String)
    email = Column(String)
    sam_status = Column(String)  # Active, Inactive, etc.
    sam_expiration_date = Column(DateTime)
    naics_codes = Column(Text)  # JSON string of NAICS codes
    psc_codes = Column(Text)  # JSON string of Product Service Codes
    certifications = Column(Text)  # JSON string of certifications (8a, HUBZone, etc.)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

class Opportunity(Base):
    """Grant opportunity from Grants.gov"""
    __tablename__ = "opportunities"
    
    id = Column(Integer, primary_key=True, index=True)
    opportunity_number = Column(String, unique=True, index=True)
    title = Column(String)
    agency = Column(String)
    category = Column(String)
    description = Column(Text)
    closing_date = Column(DateTime)
    posted_date = Column(DateTime)
    award_amount = Column(String)
    funding_types = Column(Text)  # JSON string
    eligibility = Column(Text)
    url = Column(String)
    source = Column(String)  # Grants.gov, sam.gov, etc.
    raw_data = Column(Text)  # Store raw JSON/XML response
    last_updated = Column(DateTime)
    created_at = Column(DateTime)

class Application(Base):
    """Grant application submitted by a business"""
    __tablename__ = "applications"
    
    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"))
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    opportunity_number = Column(String, index=True)
    entity_name = Column(String)
    submitted_at = Column(DateTime)
    status = Column(String)  # Draft, Submitted, Reviewed, Awarded, Rejected
    application_data = Column(Text)  # JSON string of application form data
    documents = Column(Text)  # JSON string of document URLs
    notes = Column(Text)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    # Relationships
    opportunity = relationship("Opportunity")
    profile = relationship("Profile")