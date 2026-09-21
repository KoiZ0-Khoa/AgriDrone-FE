import type { CSSProperties } from 'react'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const asset = (name: string) => `${import.meta.env.BASE_URL}home/${name}`

export const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties
