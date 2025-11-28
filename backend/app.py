# backend/app.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CRUNCH API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers AFTER app creation
from backend.api.similarity import router as sim_router
from backend.api.association import router as assoc_router
from backend.api.knowledge import router as knowledge_router
from backend.api.visualisation import router as viz_router
from backend.api.utility import router as util_router
from backend.api.metadata import router as metadata_router
from backend.api.pca_with_metadata_example import router as pca_example_router # for example PCA with metadata endpoint

# Register routers under /api prefix (endpoints inside routers now start with /{species}/...)
app.include_router(sim_router, prefix="/api")
app.include_router(assoc_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(viz_router, prefix="/api")
app.include_router(util_router, prefix="/api")
app.include_router(metadata_router, prefix="/api")
app.include_router(pca_example_router, prefix="/api")  # for example PCA with metadata endpoint

@app.get("/")
def root():
    return {"status": "CRUNCH API running", "version": "1.0.0"}
