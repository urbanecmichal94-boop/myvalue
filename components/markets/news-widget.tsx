'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'
import type { NewsItem } from '@/app/api/news/route'

interface NewsWidgetProps {
  symbol: string
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hod`
  return `${Math.floor(diff / 86400)} dní`
}

export function NewsWidget({ symbol }: NewsWidgetProps) {
  const t = useTranslations('markets')
  const [news, setNews]       = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    setNews([])

    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data: { news?: NewsItem[] }) => {
        setNews(data.news ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [symbol])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 p-4 rounded-lg border bg-card">
            <Skeleton className="w-20 h-16 rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
        {t('newsError')}
      </div>
    )
  }

  if (news.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
        {t('newsEmpty', { symbol })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {news.map((item) => (
        <a
          key={item.uuid}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-3 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
        >
          {item.thumbnail && (
            <img
              src={item.thumbnail}
              alt=""
              className="w-20 h-16 object-cover rounded shrink-0 bg-muted"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <span>{item.publisher}</span>
              <span>·</span>
              <span>{t('newsTimeAgo', { time: timeAgo(item.publishedAt) })}</span>
              <ExternalLink className="h-3 w-3 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
