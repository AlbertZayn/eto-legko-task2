from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_campaign_service
from app.schemas.campaign import (
    CampaignCreateRequest,
    CampaignDetailOut,
    CampaignOut,
    StreamOfferOut,
)
from app.services.campaigns import CampaignService
from app.services.keitaro_client import KeitaroError

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class AddOfferRequest(BaseModel):
    offer_id: int = Field(gt=0)


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
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        offers = service.list_stream_offers(campaign)
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    base = CampaignOut.model_validate(campaign)
    return CampaignDetailOut(
        **base.model_dump(),
        offers=[StreamOfferOut(**o) for o in offers],
    )


@router.post("/{campaign_id}/offers", response_model=list[StreamOfferOut])
def add_offer(
    campaign_id: int,
    body: AddOfferRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> list[StreamOfferOut]:
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        offers = service.add_offer(campaign, body.offer_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return [StreamOfferOut(**o) for o in offers]


@router.delete("/{campaign_id}/offers/{offer_id}", response_model=list[StreamOfferOut])
def remove_offer(
    campaign_id: int,
    offer_id: int,
    service: CampaignService = Depends(get_campaign_service),
) -> list[StreamOfferOut]:
    campaign = service.get_local(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        offers = service.remove_offer(campaign, offer_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeitaroError as exc:
        raise HTTPException(
            status_code=exc.status_code or 502,
            detail={"message": str(exc), "keitaro": exc.body},
        ) from exc
    return [StreamOfferOut(**o) for o in offers]
