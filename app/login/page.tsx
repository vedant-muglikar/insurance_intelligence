import Link from 'next/link'
import { login, signup } from './actions'
import { GoogleSignInButton } from './oauth-buttons'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#080d14]">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-[#34d399] opacity-[0.03] blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-[#129f8c] opacity-[0.04] blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #1e2d3d 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px] px-4">
        {/* Logo / Brand */}
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <Link href="/" className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#35d69c] to-[#148a79] text-[#061d18] shadow-[0_0_24px_rgba(18,159,140,0.15)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
            </div>
          </Link>
          <h1 className="font-['Sora'] text-2xl font-bold tracking-tight text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-[#94a3b8]">
            Sign in to your account to continue
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-[#253748] bg-[#0a1018]/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <GoogleSignInButton />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#253748]"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#0a1018] px-3 text-[#94a3b8]">OR CONTINUE WITH EMAIL</span>
            </div>
          </div>

          <form className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="rounded-lg border border-[#253748] bg-[#121c27] px-4 py-3 text-sm text-white placeholder-[#4a5f78] outline-none transition-colors focus:border-[#34d399] focus:ring-1 focus:ring-[#34d399]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]"
                >
                  Password
                </label>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="rounded-lg border border-[#253748] bg-[#121c27] px-4 py-3 text-sm text-white placeholder-[#4a5f78] outline-none transition-colors focus:border-[#34d399] focus:ring-1 focus:ring-[#34d399]"
              />
            </div>

            {searchParams?.message && (
              <div className="mt-2 rounded-md border border-[#f87171]/30 bg-[#f87171]/10 px-4 py-3 text-center text-sm text-[#f87171]">
                {searchParams.message}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3">
              <button
                formAction={login}
                className="group relative flex w-full items-center justify-center gap-2 rounded-lg bg-[#35c894] px-4 py-3 text-sm font-bold text-[#05271d] transition-all hover:bg-[#4ce6ad] hover:shadow-[0_4px_24px_rgba(53,200,148,0.25)]"
              >
                Sign in
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              </button>
              
              <button
                formAction={signup}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#253748] bg-transparent px-4 py-3 text-sm font-semibold text-[#94a3b8] transition-colors hover:bg-[#121c27] hover:text-white"
              >
                Create an account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
