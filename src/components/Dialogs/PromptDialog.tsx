import { useEffect, useRef } from 'react'

interface PromptDialogProps {
  open: boolean
  title: string
  label?: string
  placeholder?: string
  defaultValue?: string
  help?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  open, title, label, placeholder, defaultValue = '', help, onConfirm, onCancel,
}: PromptDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      if (inputRef.current) {
        inputRef.current.value = defaultValue
        inputRef.current.focus()
        const len = inputRef.current.value.length
        inputRef.current.setSelectionRange(len, len)
      }
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open, defaultValue])

  const confirm = () => onConfirm(inputRef.current?.value ?? '')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      confirm()
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" onCancel={onCancel}>
      <div className="dialog-form">
        <div className="dialog-title">{title}</div>
        {label && <label className="dialog-label">{label}</label>}
        <input
          ref={inputRef}
          className="dialog-input"
          type="text"
          placeholder={placeholder}
          defaultValue={defaultValue}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {help && <p className="dialog-help">{help}</p>}
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm}>OK</button>
        </div>
      </div>
    </dialog>
  )
}
