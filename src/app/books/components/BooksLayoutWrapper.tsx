"use client";

export function BooksLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-book-font-scope
      className="min-h-screen bg-background text-foreground"
    >
      {children}
    </div>
  );
}
