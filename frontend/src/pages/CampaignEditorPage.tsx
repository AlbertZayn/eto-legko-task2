import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addOffer,
  getCampaign,
  removeOffer,
  type CampaignDetail,
  type OfferBrief,
  type StreamOffer,
} from '../api'
import { OfferAutocomplete } from '../components/OfferAutocomplete'

export function CampaignEditorPage() {
  const { id } = useParams()
  const campaignId = Number(id)
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [offers, setOffers] = useState<StreamOffer[]>([])
  const [selected, setSelected] = useState<OfferBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(campaignId)) return
    const data = await getCampaign(campaignId)
    setCampaign(data)
    setOffers(data.offers)
  }, [campaignId])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [load])

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
      setOffers(updated)
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
      setOffers(updated)
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
    <div className="page">
      <header className="page-header">
        <p>
          <Link to="/">← Создаватор</Link>
        </p>
        <h1>{campaign.name}</h1>
        <p className="muted">
          Keitaro #{campaign.keitaro_campaign_id} · geo {campaign.geo}
          {campaign.campaign_url ? (
            <>
              {' '}
              ·{' '}
              <a href={campaign.campaign_url} target="_blank" rel="noreferrer">
                URL
              </a>
            </>
          ) : null}
        </p>
      </header>

      <section className="card">
        <h2>Офферы в потоке</h2>
        <table className="offers-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Share %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.offer_id}>
                <td>{o.offer_id}</td>
                <td>{o.name || '—'}</td>
                <td>{o.share}%</td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    disabled={busy || offers.length <= 1}
                    onClick={() => void onRemove(o.offer_id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Сумма shares: {offers.reduce((s, o) => s + o.share, 0)}%</p>
      </section>

      <form className="card form" onSubmit={onAdd}>
        <h2>Добавить оффер</h2>
        <label>
          <span>Offer</span>
          <OfferAutocomplete value={selected} onChange={setSelected} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add offer'}
        </button>
      </form>
    </div>
  )
}
