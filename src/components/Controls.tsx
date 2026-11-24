// Controles de formulário e de lista: busca, chips, interruptor e valor em reais.
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Search, X } from 'lucide-react';
import { centsFromDigits, formatBRL } from '@/domain/money';

// -----------------------------------------------------------------------------
// Busca com botão de limpar
// -----------------------------------------------------------------------------
interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label, value, onChange, className = '', ...rest },
  ref,
) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-brown-soft" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        className="block min-h-13 w-full rounded-2xl border-2 border-line bg-white pr-12 pl-12 text-lg text-brown placeholder:text-brown-soft/70 focus:border-orange-deep focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-brown-soft active:bg-peach"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

// -----------------------------------------------------------------------------
// Chip de seleção (filtros e escolhas múltiplas)
// -----------------------------------------------------------------------------
interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({ selected, onClick, children, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-base font-bold transition-colors ${
        selected ? 'bg-orange-deep text-white shadow-soft' : 'bg-white text-brown ring-1 ring-line active:bg-cream-deep'
      } ${className}`}
    >
      {selected && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Interruptor (ativo/inativo etc.)
// -----------------------------------------------------------------------------
interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-base font-bold text-brown">{label}</span>
        {description && <span className="block text-sm text-brown-soft">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-success' : 'bg-brown-soft/40'}`}
      >
        <span
          className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : ''}`}
        />
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Valor em reais com máscara de maquininha: digitar 1850 mostra R$ 18,50
// -----------------------------------------------------------------------------
interface MoneyFieldProps {
  label: string;
  valueCents: number;
  onChange: (cents: number) => void;
  error?: string | undefined;
  hint?: string;
  autoFocus?: boolean;
  id?: string;
}

export const MoneyField = forwardRef<HTMLInputElement, MoneyFieldProps>(function MoneyField(
  { label, valueCents, onChange, error, hint, autoFocus, id },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-erro` : hint ? `${inputId}-dica` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-base font-bold text-brown">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        value={formatBRL(valueCents)}
        onChange={(e) => onChange(centsFromDigits(e.target.value))}
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        }}
        className={`tabular block min-h-14 w-full rounded-2xl border-2 bg-white px-4 text-2xl font-extrabold text-brown focus:border-orange-deep focus:outline-none ${
          error ? 'border-danger' : 'border-line'
        }`}
      />
      {error ? (
        <p id={`${inputId}-erro`} className="mt-1.5 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-dica`} className="mt-1.5 text-sm text-brown-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
