from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class OfferBrief(BaseModel):
    id: int
    name: str


class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    geo: str = Field(
        min_length=1,
        max_length=200,
        description="ISO-коды стран через запятую",
    )
    offer_id: int = Field(gt=0)


class StreamOfferOut(BaseModel):
    offer_id: int
    name: str | None = None
    share: int
    state: str = "active"


class CampaignOut(BaseModel):
    id: int
    keitaro_campaign_id: int
    name: str
    alias: str
    geo: str
    offer_stream_id: int | None
    geo_stream_id: int | None
    campaign_url: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CampaignDetailOut(CampaignOut):
    offers: list[StreamOfferOut] = []
