from __future__ import annotations

import secrets
import string
from typing import Any

import httpx

from app.config import Settings


class KeitaroError(Exception):
    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class KeitaroClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = settings.keitaro_base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "Api-Key": settings.keitaro_api_key,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )

    def close(self) -> None:
        self._client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self._client.request(method, path, **kwargs)
        if response.status_code >= 400:
            try:
                body = response.json()
            except Exception:
                body = response.text
            raise KeitaroError(
                f"Keitaro {method} {path} ошибка: {response.status_code}",
                status_code=response.status_code,
                body=body,
            )
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    def list_offers(self, query: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        data = self._request("GET", "/offers")
        offers = data if isinstance(data, list) else data.get("rows", data.get("data", []))
        if not query:
            return offers[:limit]

        q = query.lower().strip()
        matched = [
            o
            for o in offers
            if q in str(o.get("name", "")).lower() or q in str(o.get("id", ""))
        ]

        # GET /offers отдаёт урезанный каталог; числовой запрос резолвим через /offers/{id}.
        if q.isdigit():
            offer_id = int(q)
            if not any(int(o.get("id", -1)) == offer_id for o in matched):
                try:
                    matched.insert(0, self.get_offer(offer_id))
                except KeitaroError:
                    pass

        return matched[:limit]

    def get_offer(self, offer_id: int) -> dict[str, Any]:
        return self._request("GET", f"/offers/{offer_id}")

    def get_campaign(self, campaign_id: int) -> dict[str, Any]:
        return self._request("GET", f"/campaigns/{campaign_id}")

    def get_campaign_streams(self, campaign_id: int) -> list[dict[str, Any]]:
        data = self._request("GET", f"/campaigns/{campaign_id}/streams")
        return data if isinstance(data, list) else []

    def create_campaign(self, name: str) -> dict[str, Any]:
        alias = self._make_alias(name)
        payload = {
            "name": name,
            "alias": alias,
            "type": "position",
            "domain_id": self.settings.keitaro_domain_id,
            "group_id": self.settings.keitaro_group_id,
            "traffic_source_id": self.settings.keitaro_source_id,
            "cost_type": "CPC",
            "cost_value": 0,
            "cost_currency": "USD",
            "cost_auto": True,
            "state": "active",
        }
        return self._request("POST", "/campaigns", json=payload)

    def create_geo_google_stream(self, campaign_id: int, geos: list[str]) -> dict[str, Any]:
        payload = {
            "campaign_id": campaign_id,
            "type": "regular",
            "name": "Geo -> Google",
            "schema": "redirect",
            "action_type": "http",
            "action_payload": "https://google.com/",
            "collect_clicks": True,
            "position": 1,
            "state": "active",
            "filters": [
                {
                    "name": "country",
                    "mode": "accept",
                    "payload": geos,
                }
            ],
            "offers": [],
            "landings": [],
        }
        return self._request("POST", "/streams", json=payload)

    def create_offers_stream(self, campaign_id: int, offer_id: int) -> dict[str, Any]:
        payload = {
            "campaign_id": campaign_id,
            "type": "default",
            "name": "Offers",
            "schema": "landings",
            "action_type": "http",
            "action_payload": "",
            "collect_clicks": True,
            "position": 2,
            "state": "active",
            "filters": [],
            "landings": [],
            "offers": [
                {
                    "offer_id": offer_id,
                    "share": 100,
                    "state": "active",
                }
            ],
        }
        return self._request("POST", "/streams", json=payload)

    def update_stream_offers(
        self, stream_id: int, offers: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return self._request("PUT", f"/streams/{stream_id}", json={"offers": offers})

    def get_stream(self, stream_id: int) -> dict[str, Any]:
        return self._request("GET", f"/streams/{stream_id}")

    @staticmethod
    def _make_alias(name: str) -> str:
        base = "".join(ch.lower() if ch.isalnum() else "-" for ch in name).strip("-")
        base = "-".join(part for part in base.split("-") if part)[:40] or "campaign"
        suffix = "".join(secrets.choice(string.hexdigits.lower()) for _ in range(6))
        return f"{base}-{suffix}"
