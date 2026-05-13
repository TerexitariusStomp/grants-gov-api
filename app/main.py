#!/usr/bin/env python3
import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uvicorn
from fastapi import FastAPI, Request, Depends, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.health import router as health_router
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
import jwt
from datetime import datetime, timedelta

from app.api.v1.opportunities import router as opportunities_router
from app.api.v1.profiles import router as profiles_router
from app.api.v1.applications import router as applications_router
from app.core.config import settings
from app.auth import create_access_token, TokenData
from app.exception_handler import get_exception_handler

# Create the app
load_dotenv()
app = FastAPI(
    title="Grants.gov API",
    version="1.0.0",
    description="API for Grants.gov opportunities and applications",
    debug=True,
    tags=[{"name": "Authentication", "description": "Authentication endpoints"}],
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use absolute path for frontend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Project root is /root/grants_api, frontend is at /root/grants_api/frontend
FRONTEND_DIR = "/root/grants_api/frontend"
print(f"Frontend directory: {FRONTEND_DIR}")
print(f"Exists: {os.path.exists(FRONTEND_DIR)}")

# Mount frontend static files at root
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

# Include routers
app.include_router(opportunities_router)
app.include_router(profiles_router)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(applications_router)

# JWT security
security = HTTPBearer()

# Add exception handler
app.add_exception_handler(Exception, get_exception_handler(app))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port="8000")