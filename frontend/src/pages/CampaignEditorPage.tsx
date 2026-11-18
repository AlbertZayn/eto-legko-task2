import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addOffer,
  formatOfferMeta,
  formatStreamSummary,
  getCampaign,
  removeOffer,
  type CampaignDetail,
  type CampaignStream,
  type OfferBrief,
} from '../api'
import { OfferAutocomplete } from '../components/OfferAutocomplete'

function StreamCard({
  stream,
  busy,
  onRemove,
}: {
  stream: CampaignStream
  busy: boolean
  onRemove: (offerId: number) => void
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

  const offerShareSum = stream.offers.reduce((s, o) => s + o.share, 0)

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
                {stream.offers.map((o) => (
                  <tr key={o.offer_id}>
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
                    <td>{o.share}%</td>
                    <td>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || stream.offers.length <= 1}
                        onClick={() => onRemove(o.offer_id)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Сумма долей: {offerShareSum}%</p>
          </>
        )}
      </div>
    </section>
  )
}

export function CampaignEditorPage() {
  const { id } = useParams()
  const campaignId = Number(id)
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [selected, setSelected] = useState<OfferBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(campaignId)) return
    const data = await getCampaign(campaignId)
    setCampaign(data)
  }, [campaignId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

  const sortedStreams = useMemo(() => {
    if (!campaign) return []
    return [...campaign.streams].sort((a, b) => {
      const aOffers = a.is_offer_stream ? 0 : 1
      const bOffers = b.is_offer_stream ? 0 : 1
      if (aOffers !== bOffers) return aOffers - bOffers
      return (a.position ?? 0) - (b.position ?? 0)
    })
  }, [campaign])

  const offerStream = useMemo(
    () => sortedStreams.find((s) => s.is_offer_stream) || null,
    [sortedStreams],
  )

  const onAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) {
      setError('Выберите оффер')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await addOffer(campaignId, selected.id)
      setCampaign(updated)
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (offerId: number) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await removeOffer(campaignId, offerId)
      setCampaign(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
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
        <h2 className="section-title">Потоки компании</h2>
        {sortedStreams.length === 0 ? (
          <p className="muted">Потоки не найдены</p>
        ) : (
          sortedStreams.map((stream) => (
            <StreamCard key={stream.id} stream={stream} busy={busy} onRemove={onRemove} />
          ))
        )}
      </section>

      {offerStream && (
        <form className="card form" onSubmit={onAdd}>
          <h2>Добавить оффер в «{offerStream.name}»</h2>
          <label>
            <span>Оффер</span>
            <OfferAutocomplete value={selected} onChange={setSelected} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Сохранение…' : 'Добавить оффер'}
          </button>
        </form>
      )}
    </div>
  )
}
