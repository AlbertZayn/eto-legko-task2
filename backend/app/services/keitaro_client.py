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
        self._offer_group_names: dict[int, str] | None = None

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

    def offer_group_names(self) -> dict[int, str]:
        if self._offer_group_names is not None:
            return self._offer_group_names
        try:
            groups = self._request("GET", "/groups", params={"type": "offers"})
        except KeitaroError:
            self._offer_group_names = {}
            return self._offer_group_names
        if not isinstance(groups, list):
            self._offer_group_names = {}
            return self._offer_group_names
        result: dict[int, str] = {}
        for group in groups:
            try:
                result[int(group["id"])] = str(group.get("name") or group["id"])
            except (KeyError, TypeError, ValueError):
                continue
        self._offer_group_names = result
        return result

    def normalize_offer(
        self,
        item: dict[str, Any],
        group_names: dict[int, str] | None = None,
    ) -> dict[str, Any]:
        """Привести ответ Keitaro к полям для автокомплита/таблицы."""
        try:
            oid = int(item["id"] if "id" in item else item["offer_id"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("offer without id") from None

        country = item.get("country") or []
        if isinstance(country, str):
            country_label = country
        elif isinstance(country, list):
            country_label = ", ".join(str(c) for c in country if c)
        else:
            country_label = ""

        payout_value = item.get("payout_value")
        try:
            payout_value = float(payout_value) if payout_value is not None else None
        except (TypeError, ValueError):
            payout_value = None

        group_id = item.get("group_id")
        try:
            group_id_int = int(group_id) if group_id is not None else None
        except (TypeError, ValueError):
            group_id_int = None

        group_label = item.get("group") or None
        if not group_label and group_id_int is not None and group_names:
            group_label = group_names.get(group_id_int)

        network_id = item.get("affiliate_network_id")
        network_label = (
            str(item["affiliate_network"])
            if item.get("affiliate_network") not in (None, "")
            else None
        )
        if not network_label and network_id not in (None, "", 0):
            network_label = str(network_id)

        name = str(item.get("name") or f"Оффер #{oid}")
        return {
            "id": oid,
            "name": name,
            "group": group_label,
            "group_id": group_id_int,
            "country": country_label or None,
            "affiliate_network": network_label,
            "affiliate_network_id": network_id,
            "payout_type": item.get("payout_type") or None,
            "payout_value": payout_value,
            "payout_currency": item.get("payout_currency") or None,
            "state": item.get("state") or None,
            "offer_type": item.get("offer_type") or None,
            "preview_path": item.get("preview_path") or None,
        }

    def resolve_offer(self, offer_id: int) -> dict[str, Any]:
        """Вернуть оффер; при 403/прочих ограничениях ACL — заглушка с ID (в поток всё ещё можно добавить)."""
        group_names = self.offer_group_names()
        try:
            return self.normalize_offer(self.get_offer(offer_id), group_names=group_names)
        except KeitaroError as exc:
            if exc.status_code in (403, 404):
                return self.normalize_offer(
                    {"id": offer_id, "name": f"Оффер #{offer_id}"},
                    group_names=group_names,
                )
            raise

    def list_offers(
        self,
        query: str | None = None,
        limit: int = 50,
        extra_offers: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        data = self._request("GET", "/offers")
        raw = data if isinstance(data, list) else data.get("rows", data.get("data", []))
        group_names = self.offer_group_names()
        by_id: dict[int, dict[str, Any]] = {}
        for item in list(raw) + list(extra_offers or []):
            try:
                normalized = self.normalize_offer(item, group_names=group_names)
            except ValueError:
                continue
            oid = int(normalized["id"])
            prev = by_id.get(oid)
            # предпочитаем запись с нормальным именем и метаданными, не заглушку
            prev_stub = not prev or str(prev.get("name", "")).startswith("Оффер #")
            new_stub = str(normalized.get("name", "")).startswith("Оффер #")
            richer = bool(normalized.get("group") or normalized.get("country"))
            if prev is None or (prev_stub and not new_stub) or (prev_stub and richer):
                by_id[oid] = normalized
        offers = list(by_id.values())

        if not query or not query.strip():
            offers.sort(key=lambda o: int(o["id"]), reverse=True)
            return offers[:limit]

        q = query.lower().strip()

        def matches(o: dict[str, Any]) -> bool:
            hay = " ".join(
                str(part)
                for part in (
                    o.get("id"),
                    o.get("name"),
                    o.get("group"),
                    o.get("country"),
                    o.get("affiliate_network"),
                    o.get("payout_type"),
                    o.get("state"),
                )
                if part not in (None, "")
            ).lower()
            return q in hay

        matched = [o for o in offers if matches(o)]

        # Полный числовой ID (обычно 4+ цифр): прямой lookup даже при ACL 403 на GET.
        if q.isdigit() and len(q) >= 4:
            offer_id = int(q)
            if not any(int(o.get("id", -1)) == offer_id for o in matched):
                matched.insert(0, self.resolve_offer(offer_id))

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
            "notes": self.settings.campaign_notes_marker,
        }
        return self._request("POST", "/campaigns", json=payload)

    def create_geo_google_stream(self, campaign_id: int, geos: list[str]) -> dict[str, Any]:
        payload = {
            "campaign_id": campaign_id,
            "type": "regular",
            "name": "zaynullin · Geo → Google",
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
            "name": "zaynullin · Offers",
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
