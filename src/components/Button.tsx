import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  // Branco sobre orange-deep: 4,6:1 (AA).
  primary: 'bg-orange-deep text-white shadow-warm active:bg-orange-darker disabled:bg-orange-deep/60',
  secondary: 'bg-white text-brown ring-1 ring-line shadow-soft active:bg-cream-deep',
  ghost: 'bg-transparent text-orange-darker active:bg-peach',
  danger: 'bg-danger text-white active:brightness-90',
};

/** Botão grande (mínimo de 48 px de altura) com estado "salvando" que bloqueia novo toque. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, block = false, disabled, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-extrabold transition disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
