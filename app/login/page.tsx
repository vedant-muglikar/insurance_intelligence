import Link from 'next/link'
import { FileMagnifyingGlass, Scales } from '@phosphor-icons/react/dist/ssr'
import PolicyPreview from '@/components/landing/PolicyPreview'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { LoginForm } from './login-form'
import './login.css'

export const metadata = {
  title: 'Sign in - BimaSetu',
  description: 'Sign in to BimaSetu to run a coverage preflight before your hospital admission.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const message = typeof params.message === 'string' ? params.message : undefined
  const status = params.status === 'success' ? 'success' : 'error'

  return (
    <main className="lg">
      <section className="lg-show" aria-label="What BimaSetu does">
        <Brand label="BimaSetu home" />

        <div className="lg-show-copy">
          <h2 className="lg-show-title">Know what you will pay before you are admitted.</h2>
          <p className="lg-show-sub">
            Every deduction traced from your policy wording to the rupee. Pick a case to see the real estimate engine
            at work.
          </p>
        </div>

        <div className="lg-demo">
          <PolicyPreview compact />
        </div>

        <ul className="lg-points">
          <li>
            <FileMagnifyingGlass size={18} weight="bold" aria-hidden /> Page-level citations from your own policy PDF
          </li>
          <li>
            <Scales size={18} weight="bold" aria-hidden /> Coverage maths runs in auditable code, not a chatbot
          </li>
        </ul>
      </section>

      <section className="lg-panel">
        <div className="lg-panel-top">
          <Brand label="BimaSetu home" size={30} />
          <ThemeToggle />
        </div>
        <div className="lg-panel-inner">
          <LoginForm message={message} status={status} />
          <Link href="/" className="lg-back">
            ← Back to the overview
          </Link>
        </div>
      </section>
    </main>
  )
}
