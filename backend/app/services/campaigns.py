from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import Settings
from app.models.campaign import Campaign
from app.services.keitaro_client import KeitaroClient, KeitaroError


def normalize_campaign_name(name: str, prefix: str) -> str:
    cleaned = name.strip()
    if cleaned.startswith(prefix):
        return cleaned
    return f"{prefix}{cleaned}"


def parse_geos(geo: str) -> list[str]:
    codes = [part.strip().upper() for part in geo.replace(";", ",").split(",")]
    codes = [c for c in codes if c]
    if not codes:
        raise ValueError("Нужен хотя бы один geo-код")
    for code in codes:
        if len(code) != 2 or not code.isalpha():
            raise ValueError(f"Некорректный geo-код: {code}")
    return codes


def equal_shares(count: int) -> list[int]:
    if count <= 0:
        return []
    base = 100 // count
    shares = [base] * count
    remainder = 100 - sum(shares)
    for i in range(remainder):
        shares[i] += 1
    return shares


class CampaignService:
    def __init__(self, db: Session, client: KeitaroClient, settings: Settings):
        self.db = db
        self.client = client
        self.settings = settings

    def create(self, name: str, geo: str, offer_id: int) -> Campaign:
        geos = parse_geos(geo)
        full_name = normalize_campaign_name(name, self.settings.campaign_name_prefix)

        # Резолвим оффер (при ACL 403 всё равно можно повесить id на поток)
        self.client.resolve_offer(offer_id)

        campaign_data = self.client.create_campaign(full_name)
        campaign_id = int(campaign_data["id"])

        try:
            geo_stream = self.client.create_geo_google_stream(campaign_id, geos)
            offer_stream = self.client.create_offers_stream(campaign_id, offer_id)
        except KeitaroError:
            raise

        domain = campaign_data.get("domain") or ""
        alias = campaign_data.get("alias") or ""
        campaign_url = f"{domain.rstrip('/')}/{alias}" if domain and alias else ""

        record = Campaign(
            keitaro_campaign_id=campaign_id,
            name=full_name,
            alias=alias,
            geo=",".join(geos),
            offer_stream_id=int(offer_stream["id"]),
            geo_stream_id=int(geo_stream["id"]),
            campaign_url=campaign_url,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def list_local(self) -> list[Campaign]:
        return (
            self.db.query(Campaign)
            .order_by(Campaign.created_at.desc())
            .all()
        )

    def get_local(self, local_id: int) -> Campaign | None:
        return self.db.get(Campaign, local_id)

    def get_local_by_keitaro(self, keitaro_id: int) -> Campaign | None:
        return (
            self.db.query(Campaign)
            .filter(Campaign.keitaro_campaign_id == keitaro_id)
            .first()
        )

    def resolve_offer_stream_id(self, campaign: Campaign) -> int:
        if campaign.offer_stream_id:
            return campaign.offer_stream_id
        streams = self.client.get_campaign_streams(campaign.keitaro_campaign_id)
        for stream in streams:
            if self._is_offer_stream(stream):
                campaign.offer_stream_id = int(stream["id"])
                self.db.commit()
                return campaign.offer_stream_id
        raise KeitaroError("У кампании не найден поток офферов")

    @staticmethod
    def _is_offer_stream(stream: dict) -> bool:
        if stream.get("type") == "default":
            return True
        if stream.get("schema") == "landings" and (stream.get("offers") is not None):
            return True
        name = str(stream.get("name") or "").lower()
        return "offer" in name

    def _enrich_offers(self, raw_offers: list[dict]) -> list[dict]:
        result = []
        for item in raw_offers:
            offer_id = int(item["offer_id"])
            offer = self.client.resolve_offer(offer_id)
            result.append(
                {
                    "offer_id": offer_id,
                    "name": offer.get("name") or f"Оффер #{offer_id}",
                    "share": int(item.get("share") or 0),
                    "state": item.get("state") or offer.get("state") or "active",
                    "group": offer.get("group"),
                    "country": offer.get("country"),
                    "affiliate_network": offer.get("affiliate_network"),
                    "payout_type": offer.get("payout_type"),
                    "payout_value": offer.get("payout_value"),
                    "payout_currency": offer.get("payout_currency"),
                }
            )
        return result

    def list_streams(self, campaign: Campaign) -> list[dict]:
        streams = self.client.get_campaign_streams(campaign.keitaro_campaign_id)
        streams = sorted(streams, key=lambda s: int(s.get("position") or 0))
        result = []
        for stream in streams:
            is_offer = self._is_offer_stream(stream)
            if is_offer and not campaign.offer_stream_id:
                campaign.offer_stream_id = int(stream["id"])
                self.db.commit()

            filters = []
            for filt in stream.get("filters") or []:
                payload = filt.get("payload") or []
                if isinstance(payload, str):
                    payload = [payload]
                filters.append(
                    {
                        "name": str(filt.get("name") or ""),
                        "mode": str(filt.get("mode") or ""),
                        "payload": [str(p) for p in payload],
                    }
                )

            offers = self._enrich_offers(stream.get("offers") or []) if is_offer else []
            action_payload = stream.get("action_payload")
            if action_payload is not None and not isinstance(action_payload, str):
                action_payload = str(action_payload)

            result.append(
                {
                    "id": int(stream["id"]),
                    "name": str(stream.get("name") or f"Поток #{stream['id']}"),
                    "type": str(stream.get("type") or ""),
                    "stream_schema": str(stream.get("schema") or ""),
                    "action_type": stream.get("action_type"),
                    "action_payload": action_payload or None,
                    "position": stream.get("position"),
                    "state": stream.get("state"),
                    "filters": filters,
                    "offers": offers,
                    "is_offer_stream": is_offer,
                }
            )
        return result

    def list_stream_offers(self, campaign: Campaign) -> list[dict]:
        for stream in self.list_streams(campaign):
            if stream.get("is_offer_stream"):
                return list(stream.get("offers") or [])
        return []

    def add_offer(self, campaign: Campaign, offer_id: int) -> list[dict]:
        self.client.resolve_offer(offer_id)
        stream_id = self.resolve_offer_stream_id(campaign)
        stream = self.client.get_stream(stream_id)
        current = list(stream.get("offers") or [])
        existing_ids = {int(o["offer_id"]) for o in current}
        if offer_id in existing_ids:
            raise ValueError(f"Оффер {offer_id} уже есть в кампании")

        offer_ids = [int(o["offer_id"]) for o in current] + [offer_id]
        shares = equal_shares(len(offer_ids))
        payload = [
            {"offer_id": oid, "share": share, "state": "active"}
            for oid, share in zip(offer_ids, shares)
        ]
        self.client.update_stream_offers(stream_id, payload)
        return self.list_streams(campaign)

    def remove_offer(self, campaign: Campaign, offer_id: int) -> list[dict]:
        stream_id = self.resolve_offer_stream_id(campaign)
        stream = self.client.get_stream(stream_id)
        current = list(stream.get("offers") or [])
        remaining_ids = [int(o["offer_id"]) for o in current if int(o["offer_id"]) != offer_id]
        if len(remaining_ids) == len(current):
            raise ValueError(f"Оффера {offer_id} нет в кампании")
        if not remaining_ids:
            raise ValueError("Нельзя удалить последний оффер из кампании")

        shares = equal_shares(len(remaining_ids))
        payload = [
            {"offer_id": oid, "share": share, "state": "active"}
            for oid, share in zip(remaining_ids, shares)
        ]
        self.client.update_stream_offers(stream_id, payload)
        return self.list_streams(campaign)
