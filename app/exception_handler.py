from fastapi import Request, Response
from fastapi.responses import JSONResponse
import logging

def get_exception_handler(app):
    def handler(request: Request, exc: Exception):
        # Log the exception
        logger = logging.getLogger(__name__)
        logger.error(f"Exception: {exc}", exc_info=True)
        
        # Return appropriate response
        if isinstance(exc, HTTPException):
            return JSONResponse(
                status_code=exc.status_code,
                content={"message": exc.detail, "code": exc.status_code}
            )
        
        return JSONResponse(
            status_code=500,
            content={"message": "Internal server error", "detail": str(exc)}
        )
    return handler
