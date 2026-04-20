'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const t      = useTranslations('auth')
  const router = useRouter()
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [ready, setReady]         = useState(false)

  // Supabase posílá token v URL hash — po načtení stránky ho zpracuje klient
  useEffect(() => {
    const supabase = createClient()
    // Posloucháme na PASSWORD_RECOVERY event — Supabase ho vyšle po zpracování hash tokenu
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { toast.error(t('resetErrorShort')); return }
    setLoading(true)

    const supabase  = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(t('resetError'))
      setLoading(false)
      return
    }

    toast.success(t('resetSuccess'))
    router.push('/dashboard')
    router.refresh()
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            {t('resetError')}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('resetTitle')}</CardTitle>
          <CardDescription>{t('resetSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('newPassword')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...' : t('resetBtn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
