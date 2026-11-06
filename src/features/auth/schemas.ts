import { z } from 'zod'

// zod's fast path compiles validators with new Function(), which a strict Content-Security-Policy (no 'unsafe-eval') blocks.
// Forms are tiny, so the plain interpreter costs nothing.
z.config({ jitless: true })

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))
const password = z.string().min(8, 'At least 8 characters')

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password') })
export const signupSchema = z
  .object({ name: z.string().trim().max(60).optional(), email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export const forgotSchema = z.object({ email })
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type ForgotValues = z.infer<typeof forgotSchema>
export type ResetValues = z.infer<typeof resetSchema>
