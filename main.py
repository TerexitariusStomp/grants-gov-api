from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import time

app = FastAPI(
    title="Grants.gov API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount frontend static files at root
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

# Keep the API under /api/v1 prefix
@app.get("/api/v1/")
async def root():
    return {"message": "Grants.gov API", "version": "1.0.0"}

@app.get("/api/v1/opportunities/")
async def search_opportunities(query: str = None, agency: str = None, category: str = None, limit: int = 50):
    """Search for grant opportunities"""
    # Mock data - replace with real Grants.gov API integration
    mock_opportunities = [
        {
            "id": "1",
            "opportunity_number": "HHS2025AFI2024001",
            "title": "Community Health Center Program",
            "agency": "Department of Health and Human Services",
            "description": "Funding to support community health centers providing primary care services.",
            "award_ceiling": "$2,000,000",
            "close_date": "2024-12-15",
            "category": "Health",
            "funding_opportunity_number": "HHS-2025-AFI-2024-001"
        },
        {
            "id": "2",
            "opportunity_number": "DOS2025BIL2024002",
            "title": "Bridges for International Education",
            "agency": "Department of State",
            "description": "Exchange programs to build international understanding through education and cultural exchange.",
            "award_ceiling": "$500,000",
            "close_date": "2024-11-30",
            "category": "Education",
            "funding_opportunity_number": "DOS-2025-BIL-2024-002"
        },
        {
            "id": "3",
            "opportunity_number": "USDA2025FAR2024003",
            "title": "Farmers Market Promotion Program",
            "agency": "Department of Agriculture",
            "description": "Grants to promote and support farmers markets, roadside stands, and other direct producer-to-consumer marketing opportunities.",
            "award_ceiling": "$100,000",
            "close_date": "2024-10-15",
            "category": "Agriculture",
            "funding_opportunity_number": "USDA-2025-FAR-2024-003"
        },
        {
            "id": "4",
            "opportunity_number": "DOE2025ERE2024004",
            "title": "Renewable Energy for Rural Communities",
            "agency": "Department of Energy",
            "description": "Funding for renewable energy projects in rural areas to reduce energy costs and increase energy independence.",
            "award_ceiling": "$1,000,000",
            "close_date": "2024-12-01",
            "category": "Energy",
            "funding_opportunity_number": "DOE-2025-ERE-2024-004"
        },
        {
            "id": "5",
            "opportunity_number": "EPA2025ENV2024005",
            "title": "Environmental Education Grants",
            "agency": "Environmental Protection Agency",
            "description": "Grants to support environmental education projects that increase public awareness and knowledge about environmental issues.",
            "award_ceiling": "$200,000",
            "close_date": "2024-11-15",
            "category": "Environment",
            "funding_opportunity_number": "EPA-2025-ENV-2024-005"
        }
    ]
    
    # Filter opportunities based on query parameters
    filtered = []
    for o in mock_opportunities:
        if query and query.lower() not in o["title"].lower() and query.lower() not in o["description"].lower():
            continue
        if agency and agency.lower() not in o["agency"].lower():
            continue
        if category and category.lower() not in o["category"].lower():
            continue
        filtered.append(o)
    
    # Apply limit
    if limit is not None:
        filtered = filtered[:limit]
    
    return filtered

@app.post("/api/v1/applications/")
async def generate_application(data: dict):
    """Generate a grant application based on user input"""
    # Return the processed data
    return {
        "status": "success",
        "message": "Application generated successfully",
        "application_id": f"APP-{int(time.time())}",
        "applicant_info": data["applicant_info"],
        "opportunity": data["opportunity"],
        "generated_at": int(time.time())
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)