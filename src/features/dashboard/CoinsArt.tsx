/** Pilha de moedas decorativa do cartão "Total a receber" (SVG próprio). */
export function CoinsArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <g stroke="#7a3a0c" strokeWidth="3">
        <ellipse cx="62" cy="96" rx="34" ry="11" fill="#f2a23a" />
        <rect x="28" y="84" width="68" height="12" fill="#f2a23a" stroke="none" />
        <ellipse cx="62" cy="84" rx="34" ry="11" fill="#f7b955" />
        <rect x="28" y="72" width="68" height="12" fill="#f2a23a" stroke="none" />
        <ellipse cx="62" cy="72" rx="34" ry="11" fill="#f7b955" />
        <rect x="28" y="60" width="68" height="12" fill="#f2a23a" stroke="none" />
        <ellipse cx="62" cy="60" rx="34" ry="11" fill="#ffd27a" />
        <circle cx="86" cy="34" r="20" fill="#ffd27a" />
      </g>
      <text x="86" y="41" textAnchor="middle" fontSize="20" fontWeight="900" fill="#7a3a0c" fontFamily="Nunito Variable, sans-serif">
        $
      </text>
    </svg>
  );
}
