import { useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import {
  forgotSchema, loginSchema, resetSchema, signupSchema,
  type ForgotValues, type LoginValues, type ResetValues, type SignupValues,
} from './schemas'

function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto pt-safe pb-safe">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
        <header>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </header>
        {children}
      </div>
    </div>
  )
}

const inputCls = 'h-12 w-full rounded-xl border border-line bg-surface px-3 text-fg outline-none focus:border-accent'
const btnCls = 'h-12 w-full rounded-xl bg-accent font-semibold text-on-accent active:scale-[0.98] transition-transform disabled:opacity-60'

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">{label}</span>
        {children}
      </label>
      {error && <span role="alert" className="mt-1 block text-sm text-money-red">{error}</span>}
    </div>
  )
}

function Notice({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'}
       className={`rounded-xl px-3 py-2 text-sm ${kind === 'error' ? 'text-money-red' : 'text-money-green'} bg-surface-2`}>
      {children}
    </p>
  )
}

function Login() {
  const [err, setErr] = useState<string>()
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginValues>({ resolver: zodResolver(loginSchema) })
  const onSubmit = handleSubmit(async (v) => {
    setErr(undefined)
    const { error } = await supabase.auth.signInWithPassword(v)
    if (error) setErr(error.message)
  })
  return (
    <Page title="Welcome back" subtitle="Log in to Money Manager">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}>
          <input {...register('email')} type="email" autoComplete="email" inputMode="email" className={inputCls} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input {...register('password')} type="password" autoComplete="current-password" className={inputCls} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <button className={btnCls} disabled={isSubmitting}>Log in</button>
      </form>
      <nav className="flex justify-between text-sm text-accent">
        <Link to="/forgot">Forgot password?</Link>
        <Link to="/signup">Create account</Link>
      </nav>
    </Page>
  )
}

function Signup() {
  const [err, setErr] = useState<string>()
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<SignupValues>({ resolver: zodResolver(signupSchema) })
  const onSubmit = handleSubmit(async (v) => {
    setErr(undefined)
    const { error } = await supabase.auth.signUp({
      email: v.email, password: v.password,
      options: { data: { name: v.name }, emailRedirectTo: window.location.origin },
    })
    if (error) setErr(error.message)
    else setSent(true)
  })
  if (sent)
    return (
      <Page title="Check your email" subtitle="We sent a verification link. Open it, then log in.">
        <Link to="/login" className="text-accent">Back to log in</Link>
      </Page>
    )
  return (
    <Page title="Create account" subtitle="Your data stays private to you.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name (optional)" error={errors.name?.message}>
          <input {...register('name')} autoComplete="name" className={inputCls} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input {...register('email')} type="email" autoComplete="email" inputMode="email" className={inputCls} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <input {...register('password')} type="password" autoComplete="new-password" className={inputCls} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <input {...register('confirm')} type="password" autoComplete="new-password" className={inputCls} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <button className={btnCls} disabled={isSubmitting}>Sign up</button>
      </form>
      <Link to="/login" className="text-sm text-accent">I already have an account</Link>
    </Page>
  )
}

function Forgot() {
  const [msg, setMsg] = useState<string>()
  const [err, setErr] = useState<string>()
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) })
  const onSubmit = handleSubmit(async (v) => {
    setErr(undefined)
    const { error } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: window.location.origin })
    if (error) setErr(error.message)
    else setMsg('If that email has an account, a reset link is on its way.')
  })
  return (
    <Page title="Reset password" subtitle="We will email you a link.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}>
          <input {...register('email')} type="email" autoComplete="email" inputMode="email" className={inputCls} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        {msg && <Notice kind="info">{msg}</Notice>}
        <button className={btnCls} disabled={isSubmitting}>Send link</button>
      </form>
      <Link to="/login" className="text-sm text-accent">Back to log in</Link>
    </Page>
  )
}

export function ResetPassword() {
  const { finishRecovery } = useAuth()
  const [err, setErr] = useState<string>()
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ResetValues>({ resolver: zodResolver(resetSchema) })
  const onSubmit = handleSubmit(async (v) => {
    setErr(undefined)
    const { error } = await supabase.auth.updateUser({ password: v.password })
    if (error) setErr(error.message)
    else finishRecovery()
  })
  return (
    <Page title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="New password" error={errors.password?.message}>
          <input {...register('password')} type="password" autoComplete="new-password" className={inputCls} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <input {...register('confirm')} type="password" autoComplete="new-password" className={inputCls} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <button className={btnCls} disabled={isSubmitting}>Save password</button>
      </form>
    </Page>
  )
}

export function VerifyEmail() {
  const { session, signOut } = useAuth()
  const [msg, setMsg] = useState<string>()
  const resend = async () => {
    const email = session?.user.email
    if (!email) return
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setMsg(error ? error.message : 'Verification email sent.')
  }
  return (
    <Page title="Verify your email" subtitle={`Open the link we sent to ${session?.user.email ?? 'your email'}, then come back.`}>
      {msg && <Notice kind="info">{msg}</Notice>}
      <button className={btnCls} onClick={resend}>Resend email</button>
      <button className="text-sm text-accent" onClick={() => void signOut()}>Use a different account</button>
    </Page>
  )
}

export function AuthRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
