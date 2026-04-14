import { SectionsProvider } from '@/lib/context/sections-context'
import { Sidebar } from '@/components/layout/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionsProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </SectionsProvider>
  )
}
