// Hambúrguer do logo. Mesmo desenho do ícone do app (scripts/gerar-icones.py).
export function BurgerArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {/* pão de cima */}
      <path d="M12 30c0-9.4 9-16 20-16s20 6.6 20 16z" fill="#F4A340" stroke="#7A3A12" strokeWidth="1.6" />
      <ellipse cx="24" cy="21" rx="1.6" ry="1" fill="#FFF4E6" />
      <ellipse cx="32" cy="18.5" rx="1.6" ry="1" fill="#FFF4E6" />
      <ellipse cx="40" cy="21" rx="1.6" ry="1" fill="#FFF4E6" />
      <ellipse cx="28" cy="25" rx="1.6" ry="1" fill="#FFF4E6" />
      <ellipse cx="36.5" cy="25" rx="1.6" ry="1" fill="#FFF4E6" />
      {/* alface */}
      <path d="M10 31.5c3 2.6 5-1 8 1.4s5-1.2 8 1.2 5-1.2 8 1.2 5-1.2 8 1.2 5-1 8-1.4l2 1.4H10z" fill="#5DA831" />
      {/* queijo */}
      <path d="M12 34h40l-6 4-4-1.5-5 3.5-4-2.5-7 3-3-3.5-5 1.5z" fill="#FFC83D" />
      {/* carne */}
      <rect x="11" y="36.5" width="42" height="7" rx="3.5" fill="#6B3518" />
      {/* pão de baixo */}
      <path d="M12 44h40v1.5a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z" fill="#F4A340" stroke="#7A3A12" strokeWidth="1.6" />
    </svg>
  );
}
