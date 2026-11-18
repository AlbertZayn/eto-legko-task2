from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class OfferBrief(BaseModel):
    id: int
    name: str
    group: str | None = None
    country: str | None = None
    affiliate_network: str | None = None
    payout_type: str | None = None
    payout_value: float | None = None
    payout_currency: str | None = None
    state: str | None = None
    offer_type: str | None = None
    preview_path: str | None = None


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
    group: str | None = None
    country: str | None = None
    affiliate_network: str | None = None
    payout_type: str | None = None
    payout_value: float | None = None
    payout_currency: str | None = None


class StreamFilterOut(BaseModel):
    name: str
    mode: str
    payload: list[str] = []


class StreamOut(BaseModel):
    id: int
    name: str
    type: str
    stream_schema: str
    action_type: str | None = None
    action_payload: str | None = None
    position: int | None = None
    state: str | None = None
    filters: list[StreamFilterOut] = []
    offers: list[StreamOfferOut] = []
    is_offer_stream: bool = False


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
    streams: list[StreamOut] = []
