'use client'

import { Languages } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getPageLang, getSavedLang, setPageLanguage, subscribe, type PageLang } from '@/lib/translate/pageTranslator'

/** English ⇄ Hindi toggle. The choice is stored in localStorage and re-applied on every screen. */
export function TranslateButton() {
  const [lang, setLang] = useState<PageLang>('en')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLang(getPageLang())
    const unsubscribe = subscribe(setLang)
    if (getSavedLang() === 'hi' && getPageLang() === 'en') {
      setLoading(true)
      setPageLanguage('hi')
        .catch((err) => console.error('[translate]', err))
        .finally(() => setLoading(false))
    }
    return unsubscribe
  }, [])

  const toggle = async () => {
    setLoading(true)
    try {
      await setPageLanguage(lang === 'hi' ? 'en' : 'hi')
    } catch (err) {
      console.error('[translate]', err)
    } finally {
      setLoading(false)
    }
  }

  const isHindi = lang === 'hi'
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-label={isHindi ? 'Switch to English' : 'हिंदी में देखें'}
      title={isHindi ? 'Switch to English' : 'हिंदी में देखें'}
      className="notranslate flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors border border-slate-700/50 disabled:opacity-60 disabled:cursor-wait"
    >
      <Languages size={14} />
      {loading ? '…' : isHindi ? 'English' : 'हिंदी'}
    </button>
  )
}
