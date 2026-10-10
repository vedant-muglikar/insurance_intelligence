'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

function back(message: string, status: 'error' | 'success' = 'error'): never {
  return redirect(`/login?message=${encodeURIComponent(message)}&status=${status}`)
}

function readCredentials(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  return { email, password }
}

export async function login(formData: FormData) {
  const { email, password } = readCredentials(formData)
  if (!email || !password) back('Enter your email and password.')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) back('Email or password is incorrect.')

  revalidatePath('/', 'layout')
  redirect('/app')
}

export async function signup(formData: FormData) {
  const { email, password } = readCredentials(formData)
  if (!email || !password) back('Enter an email and choose a password.')
  if (password.length < 8) back('Use a password with at least 8 characters.')

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) back('We could not create that account. Try a different email or a stronger password.')

  revalidatePath('/', 'layout')
  back('Check your email to confirm your account, then sign in.', 'success')
}
