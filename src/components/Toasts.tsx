import { useEffect, useState } from 'react'

interface Toast { id: number; message: string }

let _id = 0

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, timeout = 4000 } = (e as CustomEvent).detail
      const id = ++_id
      setToasts((t) => [...t, { id, message }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeout)
    }
    window.addEventListener('browsidian:notice', handler)
    return () => window.removeEventListener('browsidian:notice', handler)
  }, [])

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">{t.message}</div>
      ))}
    </div>
  )
}
