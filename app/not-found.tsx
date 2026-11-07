import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell not-found" id="main-content" tabIndex={-1}>
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This address does not match a page on BS-PROOF.</p>
      <Link className="button button-dark" href="/">Back to the home page</Link>
    </main>
  );
}
