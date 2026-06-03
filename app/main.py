from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

app = FastAPI(
    title="Distributed File Processing System",
    description="Ray-powered distributed CSV/JSON processing with FastAPI",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.on_event("startup")
async def startup_event():
    logger.info("Starting Distributed File Processing System")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Distributed File Processing System")
