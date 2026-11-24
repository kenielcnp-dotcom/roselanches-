// Toldo listrado do topo (decorativo). Só na tela inicial e no login.
export function Awning() {
  const scallops = 9;
  const w = 100 / scallops;
  return (
    <div className="safe-top bg-brown-nav" aria-hidden="true">
      <svg viewBox="0 0 100 9" preserveAspectRatio="none" className="block h-6 w-full" focusable="false">
        {Array.from({ length: scallops }, (_, i) => {
          const x = i * w;
          return (
            <path
              key={i}
              d={`M${x} 0h${w}v4.5a${w / 2} 4.5 0 0 1-${w} 0z`}
              fill={i % 2 === 0 ? '#E86A16' : '#F59A3C'}
            />
          );
        })}
      </svg>
    </div>
  );
}
