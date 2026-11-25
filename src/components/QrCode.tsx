import { useEffect, useState } from 'react';

/** QR code gerado no próprio aparelho (a biblioteca só carrega quando a tela precisa). */
export function QrCode({ value, label, size = 240 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState<{ value: string; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void import('qrcode')
      .then((qr) => qr.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: size * 2, color: { dark: '#3b2314', light: '#ffffff' } }))
      .then((url) => {
        if (alive) setSrc({ value, url });
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  const ready = src?.value === value;
  return (
    <div className="flex justify-center">
      {ready ? (
        <img src={src.url} alt={label} width={size} height={size} className="rounded-2xl bg-white p-1 ring-1 ring-line" />
      ) : (
        <div aria-hidden="true" style={{ width: size, height: size }} className="animate-pulse rounded-2xl bg-cream-deep" />
      )}
    </div>
  );
}
