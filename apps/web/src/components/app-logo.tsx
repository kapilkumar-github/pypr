import Link from 'next/link';

export function AppLogo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="Pypr home">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-canvas">
        <span className="font-display text-xl leading-none font-bold tracking-[-0.08em]">p*</span>
      </span>
      <span className="font-display text-[19px] font-bold tracking-[-0.06em] text-ink">pypr</span>
    </Link>
  );
}
