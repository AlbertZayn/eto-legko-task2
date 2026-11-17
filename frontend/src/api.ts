export type OfferBrief = {
  id: number
  name: string
}

export type Campaign = {
  id: number
  keitaro_campaign_id: number
  name: string
  alias: string
  geo: string
  offer_stream_id: number | null
  geo_stream_id: number | null
  campaign_url: string
  created_at: string
}

export type StreamOffer = {
  offer_id: number
  name: string | null
  share: number
  state: string
}

export type CampaignDetail = Campaign & {
  offers: StreamOffer[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })
  if (!response.ok) {
    let detail: unknown = await response.text()
    try {
      detail = JSON.parse(detail as string)
    } catch {
      /* оставляем текст как есть */
    }
    throw new Error(
      typeof detail === 'object' && detail && 'detail' in detail
        ? JSON.stringify((detail as { detail: unknown }).detail)
        : `HTTP ${response.status}: ${String(detail)}`,
    )
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export function searchOffers(q: string): Promise<OfferBrief[]> {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  return request(`/api/offers?${params.toString()}`)
}

export function listCampaigns(): Promise<Campaign[]> {
  return request('/api/campaigns')
}

export function createCampaign(body: {
  name: string
  geo: string
  offer_id: number
}): Promise<Campaign> {
  return request('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getCampaign(id: number): Promise<CampaignDetail> {
  return request(`/api/campaigns/${id}`)
}

export function addOffer(campaignId: number, offerId: number): Promise<StreamOffer[]> {
  return request(`/api/campaigns/${campaignId}/offers`, {
    method: 'POST',
    body: JSON.stringify({ offer_id: offerId }),
  })
}

export function removeOffer(campaignId: number, offerId: number): Promise<StreamOffer[]> {
  return request(`/api/campaigns/${campaignId}/offers/${offerId}`, {
    method: 'DELETE',
  })
}
