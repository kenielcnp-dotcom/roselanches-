import type { ReactNode } from 'react';
import { Awning } from '@/components/Awning';
import { Logo } from '@/components/Logo';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Awning />
      <main className="mx-auto max-w-md px-4 pt-8 pb-12">
        <Logo size="lg" className="justify-center" />
        <section className="mt-8 rounded-card bg-white/95 p-5 shadow-warm ring-1 ring-line">
          <h1 className="mb-5 text-2xl font-black text-brown">{title}</h1>
          {children}
        </section>
      </main>
    </div>
  );
}
