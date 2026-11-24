// Contorno de hambúrguer e copo no rodapé da tela inicial (decorativo).
export function FoodWatermark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="#E86A16" strokeOpacity="0.35" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 34c0-11 10-18 24-18s24 7 24 18z" />
        <path d="M12 38c4 3 6-1 10 1.5s6-1.5 10 1 6-1.5 10 1 6-1.5 10 1 6-1 10-1.5" />
        <rect x="13" y="42" width="50" height="7" rx="3.5" />
        <path d="M15 51h46v1a5 5 0 0 1-5 5H20a5 5 0 0 1-5-5z" />
        <path d="M30 23h.01M38 21h.01M46 23h.01" strokeWidth="3" />
        <path d="M76 22h26l-3.5 35h-19z" />
        <path d="M74 22h30" />
        <path d="M91 22l6-14h7" />
      </g>
    </svg>
  );
}
