import { useEffect, useId, useRef, useState } from 'react'
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
  const listId = useId()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<OfferBrief[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Пока открыт — ищем через наш API → Keitaro (как select2/jQuery ajax в админке).
  useEffect(() => {
    if (!open || value) return

    const seq = ++requestSeq.current
    const controller = new AbortController()
    const delay = query.trim() ? 200 : 0
    setLoading(true)
    setError(null)

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchOffers(query, { signal: controller.signal })
        if (controller.signal.aborted || seq !== requestSeq.current) return
        setOptions(results)
      } catch (err) {
        if (controller.signal.aborted || seq !== requestSeq.current) return
        setOptions([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!controller.signal.aborted && seq === requestSeq.current) {
          setLoading(false)
        }
      }
    }, delay)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query, value])

  const openPicker = () => {
    if (!open) {
      setLoading(true)
      setError(null)
    }
    setOpen(true)
    if (value) {
      onChange(null)
      setQuery('')
    }
  }

  const showList = open && !value

  return (
    <div className="autocomplete" ref={wrapRef}>
      <input
        type="text"
        value={value ? offerLabel(value) : query}
        placeholder={placeholder || 'поиск по офферам с автокомплитом'}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(null)
          setQuery(e.target.value)
          setOpen(true)
          setLoading(true)
        }}
        onFocus={openPicker}
        onClick={openPicker}
      />
      {value && formatOfferMeta(value) ? (
        <p className="offer-selected-meta">{formatOfferMeta(value)}</p>
      ) : null}
      {showList && (
        <ul id={listId} className="autocomplete-list" role="listbox">
          {loading && <li className="muted">Поиск в Keitaro…</li>}
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
