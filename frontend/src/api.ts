export type OfferBrief = {
  id: number
  name: string
  group?: string | null
  country?: string | null
  affiliate_network?: string | null
  payout_type?: string | null
  payout_value?: number | null
  payout_currency?: string | null
  state?: string | null
  offer_type?: string | null
  preview_path?: string | null
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
  group?: string | null
  country?: string | null
  affiliate_network?: string | null
  payout_type?: string | null
  payout_value?: number | null
  payout_currency?: string | null
}

export type StreamFilter = {
  name: string
  mode: string
  payload: string[]
}

export type CampaignStream = {
  id: number
  name: string
  type: string
  stream_schema: string
  action_type: string | null
  action_payload: string | null
  position: number | null
  state: string | null
  filters: StreamFilter[]
  offers: StreamOffer[]
  is_offer_stream: boolean
}

export type CampaignDetail = Campaign & {
  streams: CampaignStream[]
}

export function formatOfferMeta(offer: {
  group?: string | null
  country?: string | null
  affiliate_network?: string | null
  payout_type?: string | null
  payout_value?: number | null
  payout_currency?: string | null
  state?: string | null
  offer_type?: string | null
}): string {
  const parts: string[] = []
  if (offer.group) parts.push(offer.group)
  if (offer.country) parts.push(offer.country)
  if (offer.affiliate_network) parts.push(`сеть ${offer.affiliate_network}`)
  if (offer.payout_type) {
    const money =
      offer.payout_value != null
        ? `${offer.payout_value}${offer.payout_currency ? ` ${offer.payout_currency}` : ''}`
        : null
    parts.push(money ? `${offer.payout_type} ${money}` : offer.payout_type)
  }
  if (offer.offer_type) parts.push(offer.offer_type)
  if (offer.state && offer.state !== 'active') parts.push(offer.state)
  return parts.join(' · ')
}

export function formatStreamSummary(stream: CampaignStream): string {
  const parts: string[] = []
  parts.push(`${stream.type} / ${stream.stream_schema}`)
  if (stream.action_payload) parts.push(`→ ${stream.action_payload}`)
  for (const filt of stream.filters) {
    const payload = filt.payload.length ? filt.payload.join(', ') : '—'
    parts.push(`${filt.name} ${filt.mode} ${payload}`)
  }
  if (stream.is_offer_stream) {
    parts.push(`офферов: ${stream.offers.length}`)
  }
  return parts.join(' · ')
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

export function searchOffers(q: string = '', init?: RequestInit): Promise<OfferBrief[]> {
  const params = new URLSearchParams()
  const trimmed = String(q ?? '').trim()
  if (trimmed) params.set('q', trimmed)
  const qs = params.toString()
  return request(qs ? `/api/offers?${qs}` : '/api/offers', init)
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

export function addOffer(campaignId: number, offerId: number): Promise<CampaignDetail> {
  return request(`/api/campaigns/${campaignId}/offers`, {
    method: 'POST',
    body: JSON.stringify({ offer_id: offerId }),
  })
}

export function removeOffer(campaignId: number, offerId: number): Promise<CampaignDetail> {
  return request(`/api/campaigns/${campaignId}/offers/${offerId}`, {
    method: 'DELETE',
  })
}
