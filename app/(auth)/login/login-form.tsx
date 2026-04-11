'use client'

import { useState, useTransition } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

export function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const email = form.get('email') as string
    const password = form.get('password') as string

    startTransition(async () => {
      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/forecast')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-text-secondary">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-active focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-text-secondary">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-active focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {isPending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
