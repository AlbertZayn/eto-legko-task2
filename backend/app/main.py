from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import campaigns, offers
from app.config import get_settings
from app.services.keitaro_client import KeitaroClient, KeitaroError


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.keitaro_api_key:
        raise RuntimeError(
            "KEITARO_API_KEY не задан. Скопируйте .env.example в .env и заполните ключ."
        )
    client = KeitaroClient(settings)
    app.state.keitaro = client
    try:
        yield
    finally:
        client.close()


app = FastAPI(title="Adrobot — обёртка Keitaro", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(campaigns.router, prefix="/api")
app.include_router(offers.router, prefix="/api")


@app.exception_handler(KeitaroError)
async def keitaro_exception_handler(_: Request, exc: KeitaroError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code or 502,
        content={"detail": {"message": str(exc), "keitaro": exc.body}},
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
