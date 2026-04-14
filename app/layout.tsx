import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { SettingsProvider } from '@/lib/context/settings-context'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Myvalue',
  description: 'Sledování hodnoty osobního majetku',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${geist.variable} h-full antialiased`}>
      <body className="h-full bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <SettingsProvider>
            {children}
            <Toaster richColors position="top-right" />
          </SettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
