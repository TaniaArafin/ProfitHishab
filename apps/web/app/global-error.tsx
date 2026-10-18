'use client';

/**
 * Last-resort error page for failures in the root layout itself. It replaces the
 * whole document, so it cannot rely on the app's fonts or styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f3f6f4', color: '#181f14', margin: 0 }}>
        <main style={{ maxWidth: 420, margin: '15vh auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>ProfitHishab could not load</h1>
          <p style={{ color: '#4d5d48', marginBottom: 20 }}>Something went wrong on our side. Try again in a moment.</p>
          {error.digest ? <p style={{ color: '#6e8064', fontSize: 12, marginBottom: 20 }}>Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#4d5d48',
              color: '#f3f6f4',
              border: 0,
              borderRadius: 12,
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
