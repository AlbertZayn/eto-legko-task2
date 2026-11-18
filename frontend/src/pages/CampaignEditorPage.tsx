import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchStreamsFromKt,
  formatOfferMeta,
  formatStreamSummary,
  getCampaign,
  isOfferActive,
  offersFingerprint,
  pushOffersToKt,
  withEqualShares,
  type CampaignDetail,
  type CampaignStream,
  type OfferBrief,
  type StreamOffer,
} from '../api'
import { OfferAutocomplete } from '../components/OfferAutocomplete'

function knownStorageKey(campaignId: number): string {
  return `adrobot:campaign:${campaignId}:known-offers`
}

function legacyRetiredKey(campaignId: number): string {
  return `adrobot:campaign:${campaignId}:retired-offers`
}

function asDisabled(offer: StreamOffer): StreamOffer {
  return { ...offer, share: 0, state: 'disabled', share_pinned: !!offer.share_pinned }
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M15.5 3.5 14 2l-1 1-1.5-.5L10 4l.5 1.5L9 7l2 2-5.5 5.5 1.5 1.5L13 11l2 2 1.5-1.5.5.5L20 9l-1.5-1.5L19 6l-1.5-1.5-.5 1.5-1.5-.5zM8.5 15.5 4 21l1 1 5.5-4.5-2-2z"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function readOfferList(raw: string | null): StreamOffer[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StreamOffer[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Все офферы, которые когда-либо видели у кампании (active + disabled). */
function loadKnownOffers(campaignId: number): StreamOffer[] {
  const known = readOfferList(localStorage.getItem(knownStorageKey(campaignId)))
  if (known.length) return known

  // миграция со старого sessionStorage retired
  const legacy = readOfferList(sessionStorage.getItem(legacyRetiredKey(campaignId))).map(asDisabled)
  if (legacy.length) {
    localStorage.setItem(knownStorageKey(campaignId), JSON.stringify(legacy))
    sessionStorage.removeItem(legacyRetiredKey(campaignId))
  }
  return legacy
}

function saveKnownOffers(campaignId: number, offers: StreamOffer[]) {
  const byId = new Map<number, StreamOffer>()
  for (const offer of offers) {
    const base = isOfferActive(offer)
      ? { ...offer, state: offer.state || 'active' }
      : asDisabled(offer)
    byId.set(offer.offer_id, { ...base, share_pinned: !!offer.share_pinned })
  }
  localStorage.setItem(knownStorageKey(campaignId), JSON.stringify([...byId.values()]))
}

/**
 * Сверяет ответ Keitaro с локальной памятью:
 * пропавшие из KT офферы остаются в UI как disabled (Bring back).
 */
function reconcileOffersFromKt(
  campaignId: number,
  liveOffers: StreamOffer[],
  forcedRetired: StreamOffer[] = [],
): StreamOffer[] {
  const previous = loadKnownOffers(campaignId)
  const pinById = new Map(previous.map((o) => [o.offer_id, !!o.share_pinned]))
  for (const offer of forcedRetired) {
    if (offer.share_pinned) pinById.set(offer.offer_id, true)
  }
  const liveIds = new Set(liveOffers.map((o) => o.offer_id))

  const retiredById = new Map<number, StreamOffer>()
  for (const offer of previous) {
    if (!liveIds.has(offer.offer_id)) {
      retiredById.set(offer.offer_id, asDisabled({ ...offer, share_pinned: pinById.get(offer.offer_id) }))
    }
  }
  for (const offer of forcedRetired) {
    if (!liveIds.has(offer.offer_id)) {
      retiredById.set(
        offer.offer_id,
        asDisabled({ ...offer, share_pinned: pinById.get(offer.offer_id) ?? !!offer.share_pinned }),
      )
    }
  }

  const retired = [...retiredById.values()]
  const liveNormalized = liveOffers.map((o) => ({
    ...o,
    state: o.state && o.state !== 'disabled' ? o.state : 'active',
    share_pinned: pinById.get(o.offer_id) ?? !!o.share_pinned,
  }))
  saveKnownOffers(campaignId, [...liveNormalized, ...retired])
  return retired
}

function mergeRetired(active: StreamOffer[], retired: StreamOffer[]): StreamOffer[] {
  const seen = new Set(active.map((o) => o.offer_id))
  const extras = retired
    .filter((o) => !seen.has(o.offer_id))
    .map(asDisabled)
  return [...active, ...extras]
}

function applyStoredPins(campaignId: number, offers: StreamOffer[]): StreamOffer[] {
  const pinById = new Map(loadKnownOffers(campaignId).map((o) => [o.offer_id, !!o.share_pinned]))
  return offers.map((o) => ({ ...o, share_pinned: pinById.get(o.offer_id) ?? !!o.share_pinned }))
}

function StreamCard({
  stream,
  busy,
  pending,
  pendingOfferIds,
  selected,
  onSelectedChange,
  onAdd,
  onRemove,
  onBringBack,
  onTogglePin,
}: {
  stream: CampaignStream
  busy: boolean
  pending: boolean
  pendingOfferIds: Set<number>
  selected: OfferBrief | null
  onSelectedChange: (offer: OfferBrief | null) => void
  onAdd: (e: FormEvent) => void
  onRemove: (offerId: number) => void
  onBringBack: (offerId: number) => void
  onTogglePin: (offerId: number) => void
}) {
  const summary = formatStreamSummary(stream)

  if (!stream.is_offer_stream) {
    return (
      <section className="card stream-card stream-card-compact">
        <div className="stream-compact-row">
          <strong>{stream.name}</strong>
          <span className="muted stream-summary">{summary}</span>
        </div>
      </section>
    )
  }

  const activeOffers = stream.offers.filter(isOfferActive)
  const offerShareSum = activeOffers.reduce((s, o) => s + o.share, 0)

  return (
    <section className="card stream-card">
      <div className="stream-head">
        <div>
          <h2>{stream.name}</h2>
          <p className="muted stream-summary">{summary}</p>
        </div>
        <span className="stream-badge offer">Offers</span>
      </div>

      <div className="stream-body">
        {stream.offers.length === 0 ? (
          <p className="muted">В потоке пока нет офферов</p>
        ) : (
          <>
            <table className="offers-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Группа / гео / сеть</th>
                  <th>Payout</th>
                  <th>Доля %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stream.offers.map((o) => {
                  const active = isOfferActive(o)
                  const isNew = pendingOfferIds.has(o.offer_id)
                  const rowClass = [
                    !active ? 'offer-row-disabled' : '',
                    active && pending ? (isNew ? 'offer-row-new' : 'offer-row-pending') : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <tr key={o.offer_id} className={rowClass}>
                      <td>{o.offer_id}</td>
                      <td>
                        <div>{o.name || '—'}</div>
                        {formatOfferMeta(o) ? (
                          <div className="muted offer-option-meta">{formatOfferMeta(o)}</div>
                        ) : null}
                      </td>
                      <td className="muted">
                        {[o.group, o.country, o.affiliate_network ? `сеть ${o.affiliate_network}` : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="muted">
                        {o.payout_type
                          ? `${o.payout_type}${
                              o.payout_value != null
                                ? ` ${o.payout_value}${
                                    o.payout_currency ? ` ${o.payout_currency}` : ''
                                  }`
                                : ''
                            }`
                          : '—'}
                      </td>
                      <td>
                        <div className="share-cell">
                          <span>{o.share}%</span>
                          {active && (
                            <button
                              type="button"
                              className={`pin-btn${o.share_pinned ? ' pinned' : ''}`}
                              title={o.share_pinned ? 'Открепить долю' : 'Закрепить долю'}
                              aria-label={o.share_pinned ? 'Открепить долю' : 'Закрепить долю'}
                              aria-pressed={!!o.share_pinned}
                              disabled={busy}
                              onClick={() => onTogglePin(o.offer_id)}
                            >
                              <PinIcon pinned={!!o.share_pinned} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="offer-row-actions">
                          {active ? (
                            <button
                              type="button"
                              className="danger"
                              disabled={busy || activeOffers.length <= 1}
                              onClick={() => onRemove(o.offer_id)}
                            >
                              Удалить
                            </button>
                          ) : (
                            <>
                              <button type="button" className="danger" disabled title="Уже неактивен">
                                Удалить
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                disabled={busy}
                                onClick={() => onBringBack(o.offer_id)}
                              >
                                Bring back
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="muted">
              Сумма долей: {offerShareSum}%
              {pending ? ' · черновик — Push to KT или Cancel' : null}
            </p>
          </>
        )}

        <form className="offer-add-row" onSubmit={onAdd}>
          <label className="offer-add-field">
            <span className="visually-hidden">Добавить оффер</span>
            <OfferAutocomplete
              value={selected}
              onChange={onSelectedChange}
              placeholder="Добавить оффер…"
            />
          </label>
          <button type="submit" className="offer-add-btn" disabled={busy}>
            Добавить
          </button>
        </form>
      </div>
    </section>
  )
}

function briefToStreamOffer(offer: OfferBrief): StreamOffer {
  return {
    offer_id: offer.id,
    name: offer.name,
    share: 0,
    state: 'active',
    group: offer.group,
    country: offer.country,
    affiliate_network: offer.affiliate_network,
    payout_type: offer.payout_type,
    payout_value: offer.payout_value,
    payout_currency: offer.payout_currency,
  }
}

export function CampaignEditorPage() {
  const { id } = useParams()
  const campaignId = Number(id)
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [draftOffers, setDraftOffers] = useState<StreamOffer[] | null>(null)
  const [retiredOffers, setRetiredOffers] = useState<StreamOffer[]>([])
  const [pendingOfferIds, setPendingOfferIds] = useState<Set<number>>(() => new Set())
  const [selected, setSelected] = useState<OfferBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [pinVersion, setPinVersion] = useState(0)

  const applySynced = useCallback(
    (data: CampaignDetail, forcedRetired: StreamOffer[] = []) => {
      const live = data.streams.find((s) => s.is_offer_stream)?.offers || []
      const retired = reconcileOffersFromKt(campaignId, live, forcedRetired)
      setCampaign(data)
      setDraftOffers(null)
      setPendingOfferIds(new Set())
      setRetiredOffers(retired)
      setPinVersion((v) => v + 1)
    },
    [campaignId],
  )

  const load = useCallback(async () => {
    if (!Number.isFinite(campaignId)) return
    const data = await getCampaign(campaignId)
    applySynced(data)
  }, [campaignId, applySynced])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  const syncedOfferStream = useMemo(
    () => campaign?.streams.find((s) => s.is_offer_stream) || null,
    [campaign],
  )

  const baselineOffers = useMemo(() => {
    void pinVersion
    return applyStoredPins(
      campaignId,
      mergeRetired(syncedOfferStream?.offers ?? [], retiredOffers),
    )
  }, [syncedOfferStream, retiredOffers, campaignId, pinVersion])

  const workingOffers = useMemo(() => {
    void pinVersion
    return applyStoredPins(campaignId, draftOffers ?? baselineOffers)
  }, [draftOffers, baselineOffers, campaignId, pinVersion])

  const pending = useMemo(() => {
    if (!draftOffers) return false
    return offersFingerprint(draftOffers) !== offersFingerprint(baselineOffers)
  }, [draftOffers, baselineOffers])

  const displayStreams = useMemo(() => {
    if (!campaign) return []
    const streams = campaign.streams.map((stream) => {
      if (!stream.is_offer_stream) return stream
      return { ...stream, offers: workingOffers }
    })
    return [...streams].sort((a, b) => {
      const aOffers = a.is_offer_stream ? 0 : 1
      const bOffers = b.is_offer_stream ? 0 : 1
      if (aOffers !== bOffers) return aOffers - bOffers
      return (a.position ?? 0) - (b.position ?? 0)
    })
  }, [campaign, workingOffers])

  const onFetchStreams = async () => {
    setFetching(true)
    setError(null)
    try {
      const updated = await fetchStreamsFromKt(campaignId)
      // known-offers в localStorage + ответ KT: пропавшие станут disabled
      applySynced(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setFetching(false)
    }
  }

  const onPush = async () => {
    if (!pending) return
    const active = workingOffers.filter(isOfferActive)
    if (!active.length) {
      setError('Нужен хотя бы один активный оффер для публикации')
      return
    }
    const shareSum = active.reduce((s, o) => s + o.share, 0)
    if (shareSum !== 100) {
      setError(`Сумма долей активных офферов должна быть 100%, сейчас ${shareSum}%`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      // сохраняем pin-флаги до ответа KT
      saveKnownOffers(campaignId, workingOffers)
      const updated = await pushOffersToKt(
        campaignId,
        active.map((o) => ({ offer_id: o.offer_id, share: o.share })),
      )
      const nextRetired = workingOffers
        .filter((o) => !isOfferActive(o))
        .map((o) => ({ ...o, share: 0, state: 'disabled' }))
      applySynced(updated, nextRetired)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onCancel = () => {
    setDraftOffers(null)
    setPendingOfferIds(new Set())
    setError(null)
  }

  const onTogglePin = (offerId: number) => {
    const target = workingOffers.find((o) => o.offer_id === offerId)
    if (!target || !isOfferActive(target)) return
    setError(null)
    const nextPinned = !target.share_pinned
    const next = workingOffers.map((o) =>
      o.offer_id === offerId ? { ...o, share_pinned: nextPinned } : o,
    )
    // pin локальный: сразу в localStorage, без обязательного Push
    saveKnownOffers(campaignId, [...next, ...retiredOffers])
    if (draftOffers) setDraftOffers(next)
    setPinVersion((v) => v + 1)
  }

  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    if (!selected) {
      setError('Выберите оффер')
      return
    }
    const existing = workingOffers.find((o) => o.offer_id === selected.id)
    if (existing && isOfferActive(existing)) {
      setError(`Оффер ${selected.id} уже есть в потоке`)
      return
    }
    setError(null)
    let next: StreamOffer[]
    if (existing && !isOfferActive(existing)) {
      next = withEqualShares(
        workingOffers.map((o) =>
          o.offer_id === selected.id ? { ...briefToStreamOffer(selected), state: 'active' } : o,
        ),
      )
    } else {
      next = withEqualShares([...workingOffers, briefToStreamOffer(selected)])
    }
    setDraftOffers(next)
    setPendingOfferIds((prev) => new Set(prev).add(selected.id))
    setSelected(null)
  }

  const onRemove = (offerId: number) => {
    const activeCount = workingOffers.filter(isOfferActive).length
    const target = workingOffers.find((o) => o.offer_id === offerId)
    if (!target || !isOfferActive(target)) return
    if (activeCount <= 1) {
      setError('Нельзя деактивировать последний активный оффер')
      return
    }
    setError(null)
    setDraftOffers(
      withEqualShares(
        workingOffers.map((o) =>
          o.offer_id === offerId ? { ...o, state: 'disabled', share: 0 } : o,
        ),
      ),
    )
  }

  const onBringBack = (offerId: number) => {
    const target = workingOffers.find((o) => o.offer_id === offerId)
    if (!target || isOfferActive(target)) return
    setError(null)
    setDraftOffers(
      withEqualShares(
        workingOffers.map((o) =>
          o.offer_id === offerId ? { ...o, state: 'active' } : o,
        ),
      ),
    )
    setPendingOfferIds((prev) => new Set(prev).add(offerId))
  }

  if (!campaign) {
    return (
      <div className="page">
        <p className="muted">{error || 'Загрузка…'}</p>
        <Link to="/">← Назад</Link>
      </div>
    )
  }

  return (
    <div className="page page-wide">
      <header className="page-header">
        <p>
          <Link to="/">← Создаватор</Link>
        </p>
        <h1>{campaign.name}</h1>
        <p className="muted">
          Keitaro #{campaign.keitaro_campaign_id} · гео {campaign.geo}
          {campaign.campaign_url ? (
            <>
              {' '}
              ·{' '}
              <a href={campaign.campaign_url} target="_blank" rel="noreferrer">
                ссылка
              </a>
            </>
          ) : null}
        </p>
      </header>

      <section className="streams">
        <div className="section-head">
          <h2 className="section-title">Потоки компании</h2>
          <div className="section-actions">
            <button
              type="button"
              className="ghost"
              disabled={busy || fetching}
              onClick={() => void onFetchStreams()}
            >
              {fetching ? 'Fetching…' : 'Fetch streams from KT'}
            </button>
            {pending && (
              <>
                <button
                  type="button"
                  disabled={busy || fetching}
                  onClick={() => void onPush()}
                >
                  {busy ? 'Pushing…' : 'Push to KT'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || fetching}
                  onClick={onCancel}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {displayStreams.length === 0 ? (
          <p className="muted">Потоки не найдены</p>
        ) : (
          displayStreams.map((stream) => (
            <StreamCard
              key={stream.id}
              stream={stream}
              busy={busy || fetching}
              pending={pending && stream.is_offer_stream}
              pendingOfferIds={pendingOfferIds}
              selected={selected}
              onSelectedChange={setSelected}
              onAdd={onAdd}
              onRemove={onRemove}
              onBringBack={onBringBack}
              onTogglePin={onTogglePin}
            />
          ))
        )}
      </section>
    </div>
  )
}
