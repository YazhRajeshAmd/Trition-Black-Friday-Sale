import { useState, useEffect } from 'react'

export function useCountUp(target, { duration = 1000 } = {}) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) return
    const start = performance.now()
    const ease = (t) => 1 - Math.pow(1 - t, 3)
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      setValue(target * ease(progress))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return value
}
