// app/(app)/layout.tsx
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { OrangeSpinner } from '@/components/orange-spinner'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 57)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset className="flex-1 flex flex-col min-h-screen">
        <SiteHeader />
        <OrangeSpinner 
          delay={1000} 
          className="flex-1 flex items-center justify-center"
        >
          <div className="w-full h-full">
            {children}
          </div>
        </OrangeSpinner>
      </SidebarInset>
    </SidebarProvider>
  )
}