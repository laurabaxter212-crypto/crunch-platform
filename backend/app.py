# backend/app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# -------------------------------------------------------
# Create app
# -------------------------------------------------------
app = FastAPI(title="CRUNCH API", version="1.0.0")

# -------------------------------------------------------
# CORS (single clean definition)
# -------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # for development; later restrict to FE domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# -------------------------------------------------------
# Import routers AFTER app is created
# -------------------------------------------------------
from backend.api.similarity import router as sim_router
from backend.api.association import router as assoc_router
from backend.api.knowledge import router as knowledge_router
from backend.api.visualisation import router as viz_router
from backend.api.utility import router as util_router
from backend.api.metadata import router as metadata_router
from backend.api.pca_with_metadata_example import router as pca_example_router
from backend.api.qc import router as qc_router
from backend.api.pubmed import router as pubmed_router

# -------------------------------------------------------
# Register routers under /api prefix
# -------------------------------------------------------
app.include_router(sim_router,        prefix="/api")
app.include_router(assoc_router,      prefix="/api")
app.include_router(knowledge_router,  prefix="/api")
app.include_router(viz_router,        prefix="/api")
app.include_router(util_router,       prefix="/api")
app.include_router(metadata_router,   prefix="/api")
app.include_router(pca_example_router, prefix="/api")
app.include_router(qc_router,         prefix="/api")
app.include_router(pubmed_router,     prefix="/api")

# -------------------------------------------------------
# Root endpoint
# -------------------------------------------------------
@app.get("/")
def root():
    return {"status": "CRUNCH API running", "version": "1.0.0"}
