export default function Loading() {
  return (
    <div className="container-page py-12" aria-busy="true" aria-live="polite">
      <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-gray-100" />
      <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-surface" />
        ))}
      </div>
      <span className="sr-only">Loading this section of the portal.</span>
    </div>
  );
}
