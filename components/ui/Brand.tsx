import Link from 'next/link'

/** BimaSetu mark: the logo's bridge and shield on a light tile, so its colours read on dark and light themes alike. */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <span className="pl-mark" style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bimasetu-mark.png" alt="" width={Math.round(size * 0.82)} />
    </span>
  )
}

export function Brand({ href = '/', size = 38, label = 'BimaSetu, home' }: { href?: string; size?: number; label?: string }) {
  return (
    <Link href={href} className="pl-brand" aria-label={label}>
      <BrandMark size={size} />
      <span className="pl-brand-name">
        Bima<span>Setu</span>
      </span>
    </Link>
  )
}
