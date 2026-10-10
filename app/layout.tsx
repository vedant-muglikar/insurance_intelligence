import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import './theme.css'
import './ledger.css'
import './ledger-tool.css'

// Geist for text and display, Geist Mono for figures. Self-hosted by next/font.
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'PolicyLens - Insurance Policy Intelligence',
  description:
    'Upload your health insurance PDF and instantly understand coverage, exclusions, limits, and out-of-pocket costs, backed by page-level citations.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c1411' },
    { media: '(prefers-color-scheme: light)', color: '#eef1ee' },
  ],
}

// Runs before first paint so the saved theme never flashes. Dark is the default.
const THEME_INIT = `try{var t=localStorage.getItem('pl-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark'}catch(e){document.documentElement.dataset.theme='dark'}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
