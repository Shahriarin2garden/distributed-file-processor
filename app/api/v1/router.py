from fastapi import APIRouter
from app.api.v1.endpoints import upload, process, status, result

api_router = APIRouter()

api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(process.router, tags=["process"])
api_router.include_router(status.router, tags=["status"])
api_router.include_router(result.router, tags=["result"])
