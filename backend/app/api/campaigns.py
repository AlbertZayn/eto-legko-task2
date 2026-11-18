from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_campaign_service
from app.schemas.campaign import (
    CampaignCreateRequest,
    CampaignDetailOut,
    CampaignOut,
    StreamOut,
)
from app.services.campaigns import CampaignService
from app.services.keitaro_client import KeitaroError

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class AddOfferRequest(BaseModel):
    offer_id: int = Field(gt=0)


class PushOfferItem(BaseModel):
    offer_id: int = Field(gt=0)
    share: int = Field(ge=0, le=100)


class PushOffersRequest(BaseModel):
    offers: list[PushOfferItem] = Field(default_factory=list)
    # backward-compatible: если пришли только id — доли посчитаем на бэкенде
    offer_ids: list[int] | None = None


def _detail(campaign, streams: list[dict]) -> CampaignDetailOut:
    base = CampaignOut.model_validate(campaign)
    return CampaignDetailOut(
        **base.model_dump(),
        streams=[StreamOut(**s) for s in streams],
    )


@router.get("", response_model=list[CampaignOut])
def list_campaigns(service: CampaignService = Depends(get_campaign_service)) -> list[CampaignOut]:
    return [CampaignOut.model_validate(c) for c in service.list_local()]


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
def create_campaign(
    body: CampaignCreateRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignOut:
    try:
        campaign = service.create(body.name, body.geo, body.offer_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return CampaignOut.model_validate(campaign)


@router.get("/{campaign_id}", response_model=CampaignDetailOut)
def get_campaign(
    campaign_id: int,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignDetailOut:
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    try:
        streams = service.list_streams(campaign)
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return _detail(campaign, streams)


@router.post("/{campaign_id}/streams/fetch", response_model=CampaignDetailOut)
def fetch_streams(
    campaign_id: int,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignDetailOut:
    """Перечитывает потоки и офферы из Keitaro (точка расширения для будущей синхронизации)."""
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    try:
        streams = service.list_streams(campaign)
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return _detail(campaign, streams)


@router.post("/{campaign_id}/offers/push", response_model=CampaignDetailOut)
def push_offers(
    campaign_id: int,
    body: PushOffersRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignDetailOut:
    """Публикует черновик офферов в Keitaro (с долями, в т.ч. pinned)."""
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    payload = [{"offer_id": item.offer_id, "share": item.share} for item in body.offers]
    if not payload and body.offer_ids:
        payload = [{"offer_id": oid} for oid in body.offer_ids]
    if not payload:
        raise HTTPException(status_code=400, detail="Нужен хотя бы один оффер для публикации")
    try:
        streams = service.push_offers(campaign, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return _detail(campaign, streams)


@router.post("/{campaign_id}/offers", response_model=CampaignDetailOut)
def add_offer(
    campaign_id: int,
    body: AddOfferRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignDetailOut:
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    try:
        streams = service.add_offer(campaign, body.offer_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return _detail(campaign, streams)


@router.delete("/{campaign_id}/offers/{offer_id}", response_model=CampaignDetailOut)
def remove_offer(
    campaign_id: int,
    offer_id: int,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignDetailOut:
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Кампания не найдена")
    try:
        streams = service.remove_offer(campaign, offer_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return _detail(campaign, streams)
