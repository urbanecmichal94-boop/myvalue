'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase'

export default function RegisterPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (password !== passwordConfirm) {
      toast.error(t('errorPasswordMismatch'))
      return
    }
    if (password.length < 6) {
      toast.error(t('errorPasswordShort'))
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error(t('errorEmailTaken'))
      } else {
        toast.error(t('errorGeneral'))
      }
      setLoading(false)
      return
    }

    toast.success(t('successRegister'))
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('registerTitle')}</CardTitle>
          <CardDescription>{t('registerSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-confirm">{t('passwordConfirm')}</Label>
              <Input
                id="password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...' : t('registerBtn')}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {t('hasAccount')}{' '}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              {t('toLogin')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
