import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createCampaign, listCampaigns, type Campaign, type OfferBrief } from '../api'
import { OfferAutocomplete } from '../components/OfferAutocomplete'

export function CreateCampaignPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('campaign1')
  const [geo, setGeo] = useState('AU')
  const [offer, setOffer] = useState<OfferBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)

  const loadCampaigns = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      setCampaigns(await listCampaigns())
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCampaigns()
  }, [loadCampaigns])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!offer) {
      setError('Выберите оффер из списка автокомплита')
      return
    }
    setBusy(true)
    try {
      const created = await createCampaign({
        name,
        geo,
        offer_id: offer.id,
      })
      await loadCampaigns()
      navigate(`/campaigns/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>New campaign</h1>
        <p className="muted">Создаватор Keitaro · префикс test_zaynullin_</p>
      </header>

      <form className="card form" onSubmit={onSubmit}>
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="имя кампании"
            required
          />
        </label>
        <label>
          <span>Geo</span>
          <input
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            placeholder="MX,AU,RO,..."
            required
          />
        </label>
        <label>
          <span>Offer</span>
          <OfferAutocomplete value={offer} onChange={setOffer} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </form>

      <section className="card">
        <div className="section-head">
          <h2>Мои кампании</h2>
          <button type="button" className="ghost" onClick={() => void loadCampaigns()} disabled={listLoading}>
            Обновить
          </button>
        </div>
        {listLoading && <p className="muted">Загрузка…</p>}
        {!listLoading && listError && (
          <p className="error">
            Не удалось загрузить список: {listError}
          </p>
        )}
        {!listLoading && !listError && campaigns.length === 0 && (
          <p className="muted">Пока нет созданных через это приложение кампаний.</p>
        )}
        {!listLoading && !listError && campaigns.length > 0 && (
          <ul className="campaign-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link to={`/campaigns/${c.id}`}>
                  {c.name} <span className="muted">#{c.keitaro_campaign_id}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
