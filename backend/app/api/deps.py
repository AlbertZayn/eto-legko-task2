from __future__ import annotations

from collections.abc import Generator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.services.campaigns import CampaignService
from app.services.keitaro_client import KeitaroClient


def get_keitaro_client(request: Request) -> KeitaroClient:
    return request.app.state.keitaro


def get_campaign_service(
    db: Session = Depends(get_db),
    client: KeitaroClient = Depends(get_keitaro_client),
    settings: Settings = Depends(get_settings),
) -> CampaignService:
    return CampaignService(db=db, client=client, settings=settings)
