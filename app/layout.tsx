import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Augusto Group — Cash Flow',
  description: 'Weekly cash flow forecast',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  )
}
