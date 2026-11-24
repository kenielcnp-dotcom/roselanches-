import { BurgerArt } from './BurgerArt';

interface LogoProps {
  size?: 'md' | 'lg';
  className?: string;
}

/** Hambúrguer + "Lanches da" (sans pesada) + "Rose" (cursiva, sublinhado laranja). */
export function Logo({ size = 'md', className = '' }: LogoProps) {
  const big = size === 'lg';
  return (
    <div className={`flex items-center gap-2 ${className}`} role="img" aria-label="Lanches da Rose">
      <BurgerArt className={big ? 'h-20 w-20 shrink-0' : 'h-16 w-16 shrink-0'} />
      <div className="leading-none" aria-hidden="true">
        <div className={`font-black tracking-tight whitespace-nowrap text-brown ${big ? 'text-2xl' : 'text-xl'}`}>Lanches da</div>
        <div className="relative -mt-0.5 inline-block">
          <span className={`font-script text-logo-red ${big ? 'text-5xl' : 'text-4xl'}`}>Rose</span>
          <svg
            viewBox="0 0 100 12"
            className="absolute -bottom-1.5 left-1 h-3 w-[110%]"
            preserveAspectRatio="none"
            focusable="false"
          >
            <path d="M2 9C30 3 62 1 98 4" fill="none" stroke="#E86A16" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
