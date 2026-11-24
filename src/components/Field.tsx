import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-erro` : hint ? `${inputId}-dica` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-base font-bold text-brown">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block min-h-12 w-full rounded-2xl border-2 bg-white px-4 text-lg text-brown placeholder:text-brown-soft/60 focus:border-orange-deep focus:outline-none ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...rest}
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
