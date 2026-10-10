import Link from 'next/link'
import { BookBookmark } from '@phosphor-icons/react/dist/ssr'

/** PolicyLens mark: the book glyph in a brand-coloured square. Used by every page so the name and mark stay in one place. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="pl-mark" style={{ width: size, height: size }} aria-hidden>
      <BookBookmark size={Math.round(size * 0.56)} weight="bold" />
    </span>
  )
}

export function Brand({ href = '/', size = 34, label = 'PolicyLens, home' }: { href?: string; size?: number; label?: string }) {
  return (
    <Link href={href} className="pl-brand" aria-label={label}>
      <BrandMark size={size} />
      <span className="pl-brand-name">
        Policy<span>Lens</span>
      </span>
    </Link>
  )
}
