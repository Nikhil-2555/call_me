// components/orange-spinner.tsx
'use client'
import { useEffect, useState } from 'react'

export function OrangeSpinner({
  delay = 1000,
  className,
  children,
}: {
  delay?: number
  className?: string          // ✅ add this
  children?: React.ReactNode
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  if (show) return <>{children}</>

  return (
    <div className={className}>       {/* ✅ pass className */}
      <div
        className="w-12 h-12 border-4 border-transparent border-t-[#FF6B00] rounded-full animate-spin"
        role="status"
      >
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  )
}