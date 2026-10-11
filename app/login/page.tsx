import Link from 'next/link'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { LoginForm } from './login-form'
import { Logo3D } from './logo-3d'
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
      <section className="lg-show" aria-label="BimaSetu">
        <Logo3D />
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
