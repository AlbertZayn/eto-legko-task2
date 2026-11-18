import { useEffect, useRef, useState } from 'react'
import { formatOfferMeta, searchOffers, type OfferBrief } from '../api'

type Props = {
  value: OfferBrief | null
  onChange: (offer: OfferBrief | null) => void
  placeholder?: string
}

function offerLabel(offer: OfferBrief): string {
  return `[${offer.id}] ${offer.name}`
}

export function OfferAutocomplete({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<OfferBrief[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (value) return

    const controller = new AbortController()
    const delay = query.trim() ? 200 : 50
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const results = await searchOffers(query, { signal: controller.signal })
        if (!controller.signal.aborted) setOptions(results)
      } catch (err) {
        if (controller.signal.aborted) return
        setOptions([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, delay)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, value])

  const showList = open && !value
  const selectedMeta = value ? formatOfferMeta(value) : ''

  return (
    <div className="autocomplete" ref={wrapRef}>
      <input
        type="text"
        value={value ? offerLabel(value) : query}
        placeholder={placeholder || 'поиск по офферам с автокомплитом'}
        autoComplete="off"
        onChange={(e) => {
          onChange(null)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          if (value) {
            onChange(null)
            setQuery('')
          }
        }}
      />
      {value && selectedMeta && <p className="offer-selected-meta">{selectedMeta}</p>}
      {showList && (
        <ul className="autocomplete-list" role="listbox">
          {loading && <li className="muted">Загрузка…</li>}
          {!loading && error && <li className="error-inline">Ошибка поиска: {error}</li>}
          {!loading && !error && options.length === 0 && (
            <li className="muted">
              {query.trim()
                ? `Ничего не найдено по «${query.trim()}». Попробуйте ID оффера (например 18813).`
                : 'Нет доступных офферов. Введите ID вручную.'}
            </li>
          )}
          {!loading &&
            options.map((offer) => {
              const meta = formatOfferMeta(offer)
              return (
                <li key={offer.id}>
                  <button
                    type="button"
                    role="option"
                    className="offer-option"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onChange(offer)
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    <span className="offer-option-title">{offerLabel(offer)}</span>
                    {meta ? <span className="offer-option-meta">{meta}</span> : null}
                  </button>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
