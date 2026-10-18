import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-ink-muted">This page or record does not exist, or it belongs to another business.</p>
      <Link href="/dashboard" className="btn-primary">
        Go to dashboard
      </Link>
    </div>
  );
}
