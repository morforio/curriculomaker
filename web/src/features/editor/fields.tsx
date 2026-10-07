import { useState } from 'react'

const inputCls =
  'w-full rounded border border-gray-300 bg-white/5 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-gray-600">{label}</span>
      <input className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-gray-600">{label}</span>
      <textarea className={inputCls} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
    </label>
  )
}

/** Campo de lista separada por vírgula: mantém o texto digitado localmente e envia o array já separado. */
export function CommaListField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [text, setText] = useState(value.join(', '))
  return (
    <TextField
      label={label}
      value={text}
      onChange={(v) => {
        setText(v)
        onChange(
          v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        )
      }}
    />
  )
}
