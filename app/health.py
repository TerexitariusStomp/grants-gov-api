from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": "2025-01-01T00:00:00Z", "version": "1.0"}
