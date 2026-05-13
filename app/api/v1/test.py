from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class SimpleResponse(BaseModel):
    message: str
    value: int

@router.get("/test")
async def test_endpoint():
    print(">>> TEST ENDPOINT CALLED <<<")  # Debug print
    return {"message": "Hello", "value": 42}