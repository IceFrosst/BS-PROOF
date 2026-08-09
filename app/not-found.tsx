import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell not-found" id="main-content" tabIndex={-1}>
      <p className="eyebrow">404 · archive boundary</p>
      <h1>Report not found</h1>
      <p>This route does not match a retained dashboard artifact.</p>
      <Link className="button button-dark" href="/">Back to dashboard</Link>
    </main>
  );
}
