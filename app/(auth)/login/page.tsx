import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-8">
      <h1 className="mb-2 text-xl font-semibold text-text-primary">Augusto Cash Flow</h1>
      <p className="mb-6 text-sm text-text-muted">Sign in to continue</p>
      <LoginForm />
    </div>
  )
}
