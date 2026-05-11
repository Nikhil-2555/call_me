// components/hydration-protector.tsx
'use client'

import { useEffect, useState } from 'react'

export default function HydrationProtector({
  children,  // Make sure children prop is properly declared
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return <>{children}</>
}