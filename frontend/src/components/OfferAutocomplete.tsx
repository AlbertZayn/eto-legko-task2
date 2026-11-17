import { useEffect, useRef, useState } from 'react'
import { searchOffers, type OfferBrief } from '../api'

type Props = {
  value: OfferBrief | null
  onChange: (offer: OfferBrief | null) => void
  placeholder?: string
}

export function OfferAutocomplete({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<OfferBrief[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const results = await searchOffers(query)
        if (!cancelled) setOptions(results)
      } catch {
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="autocomplete" ref={wrapRef}>
      <input
        type="text"
        value={value ? `[${value.id}] ${value.name}` : query}
        placeholder={placeholder || 'поиск по офферам с автокомплитом'}
        onChange={(e) => {
          onChange(null)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <ul className="autocomplete-list">
          {loading && <li className="muted">Загрузка…</li>}
          {!loading && options.length === 0 && (
            <li className="muted">
              {query.trim()
                ? `Ничего не найдено по «${query.trim()}»`
                : 'Начните вводить имя или ID оффера'}
            </li>
          )}
          {!loading &&
            options.map((offer) => (
              <li key={offer.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(offer)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  [{offer.id}] {offer.name}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
