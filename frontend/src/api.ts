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
  /** Локально: доля зафиксирована и не пересчитывается. */
  share_pinned?: boolean
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

export function fetchStreamsFromKt(campaignId: number): Promise<CampaignDetail> {
  return request(`/api/campaigns/${campaignId}/streams/fetch`, {
    method: 'POST',
  })
}

export function pushOffersToKt(
  campaignId: number,
  offers: { offer_id: number; share: number }[],
): Promise<CampaignDetail> {
  return request(`/api/campaigns/${campaignId}/offers/push`, {
    method: 'POST',
    body: JSON.stringify({ offers }),
  })
}

/** Равномерно распределить total процентов на count частей. */
export function equalSharesOf(total: number, count: number): number[] {
  if (count <= 0) return []
  if (total <= 0) return Array.from({ length: count }, () => 0)
  const base = Math.floor(total / count)
  const shares = Array.from({ length: count }, () => base)
  let remainder = total - base * count
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    shares[i] += 1
  }
  return shares
}

/** Равные доли на 100% (как на бэкенде). */
export function equalShares(count: number): number[] {
  return equalSharesOf(100, count)
}

export function isOfferActive(offer: Pick<StreamOffer, 'state'>): boolean {
  const state = String(offer.state || 'active').toLowerCase()
  return state !== 'disabled' && state !== 'inactive'
}

/**
 * Пересчёт долей: pinned active сохраняют share,
 * оставшиеся % делятся между unpinned active; disabled → 0.
 */
export function withEqualShares(offers: StreamOffer[]): StreamOffer[] {
  const pinnedSum = offers
    .filter((o) => isOfferActive(o) && o.share_pinned)
    .reduce((sum, o) => sum + Math.max(0, Math.round(o.share)), 0)
  const remainder = Math.max(0, 100 - pinnedSum)
  const unpinnedCount = offers.filter((o) => isOfferActive(o) && !o.share_pinned).length
  const freeShares = equalSharesOf(remainder, unpinnedCount)
  let freeIndex = 0

  return offers.map((offer) => {
    if (!isOfferActive(offer)) {
      return { ...offer, share: 0, state: 'disabled' }
    }
    if (offer.share_pinned) {
      return {
        ...offer,
        share: Math.max(0, Math.round(offer.share)),
        state: 'active',
        share_pinned: true,
      }
    }
    const share = freeShares[freeIndex] ?? 0
    freeIndex += 1
    return { ...offer, share, state: 'active', share_pinned: false }
  })
}

export function offersFingerprint(offers: StreamOffer[]): string {
  // pin — локальный флаг, в pending/KT не входит
  return offers
    .map((o) => `${o.offer_id}:${isOfferActive(o) ? 'a' : 'd'}:${isOfferActive(o) ? o.share : 0}`)
    .join('|')
}
