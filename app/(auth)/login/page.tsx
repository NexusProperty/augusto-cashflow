import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="mb-2 text-xl font-semibold text-zinc-900">Augusto Cash Flow</h1>
      <p className="mb-6 text-sm text-zinc-500">Sign in to continue</p>
      <LoginForm />
    </div>
  )
}
