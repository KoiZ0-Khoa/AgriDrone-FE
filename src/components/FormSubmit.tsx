import { useEffect, useRef } from 'react'

// Modal footer buttons live outside their form. A real submit button restores
// native Enter submission, including field validation, without intercepting
// Select, date pickers, textarea newlines, or IME composition.
export function FormSubmit({ disabled = false }: { disabled?: boolean }) {
  const submit = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const button = submit.current
    const form = button?.form
    if (!button || !form) return
    function shortcut(event: KeyboardEvent) {
      if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey || event.defaultPrevented || event.isComposing || event.keyCode === 229) return
      const target = event.target
      if (!(target instanceof HTMLElement) || !['INPUT', 'TEXTAREA'].includes(target.tagName) || target.closest('[role="combobox"], [role="listbox"]') || target.isContentEditable) return
      if (target instanceof HTMLInputElement && ['checkbox', 'radio', 'file', 'button', 'submit'].includes(target.type)) return
      event.preventDefault()
      if (!button!.disabled && !event.repeat) form!.requestSubmit(button!)
    }
    form.addEventListener('keydown', shortcut)
    return () => form.removeEventListener('keydown', shortcut)
  }, [])
  return <button ref={submit} type="submit" hidden tabIndex={-1} aria-hidden="true" disabled={disabled} />
}
