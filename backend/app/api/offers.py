from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_keitaro_client
from app.db import get_db
from app.models.campaign import Campaign
from app.schemas.campaign import OfferBrief
from app.services.keitaro_client import KeitaroClient, KeitaroError

router = APIRouter(prefix="/offers", tags=["offers"])


def _to_brief(o: dict) -> OfferBrief:
    return OfferBrief(
        id=int(o["id"]),
        name=str(o.get("name") or o["id"]),
        group=o.get("group"),
        country=o.get("country"),
        affiliate_network=o.get("affiliate_network"),
        payout_type=o.get("payout_type"),
        payout_value=o.get("payout_value"),
        payout_currency=o.get("payout_currency"),
        state=o.get("state"),
        offer_type=o.get("offer_type"),
        preview_path=o.get("preview_path"),
    )


def _offers_from_local_campaigns(db: Session, client: KeitaroClient) -> list[dict]:
    """Офферы из потоков уже созданных нами кампаний — расширяют каталог при урезанном GET /offers."""
    extra: list[dict] = []
    seen: set[int] = set()
    campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).limit(50).all()
    for campaign in campaigns:
        stream_id = campaign.offer_stream_id
        if not stream_id:
            continue
        try:
            stream = client.get_stream(int(stream_id))
        except KeitaroError:
            continue
        for item in stream.get("offers") or []:
            try:
                oid = int(item["offer_id"])
            except (KeyError, TypeError, ValueError):
                continue
            if oid in seen:
                continue
            seen.add(oid)
            extra.append(client.resolve_offer(oid))
    return extra


@router.get("", response_model=list[OfferBrief])
def search_offers(
    q: str | None = Query(default=None, description="Поиск по имени, ID, группе, стране"),
    limit: int = Query(default=30, ge=1, le=100),
    client: KeitaroClient = Depends(get_keitaro_client),
    db: Session = Depends(get_db),
) -> list[OfferBrief]:
    extra = _offers_from_local_campaigns(db, client)
    offers = client.list_offers(query=q, limit=limit, extra_offers=extra)
    return [_to_brief(o) for o in offers]
