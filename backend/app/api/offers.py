from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_keitaro_client
from app.schemas.campaign import OfferBrief
from app.services.keitaro_client import KeitaroClient

router = APIRouter(prefix="/offers", tags=["offers"])


@router.get("", response_model=list[OfferBrief])
def search_offers(
    q: str | None = Query(default=None, description="Search by name or id"),
    limit: int = Query(default=30, ge=1, le=100),
    client: KeitaroClient = Depends(get_keitaro_client),
) -> list[OfferBrief]:
    offers = client.list_offers(query=q, limit=limit)
    return [OfferBrief(id=int(o["id"]), name=str(o.get("name") or o["id"])) for o in offers]
