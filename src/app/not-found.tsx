import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 font-serif text-muted-foreground">
      <h1 className="text-6xl font-semibold text-foreground">404</h1>
      <p className="text-lg">Page not found.</p>
      <Link
        href="/"
        className="text-sm underline underline-offset-4 transition-colors hover:text-foreground"
      >
        Back to home
      </Link>
    </main>
  );
}
