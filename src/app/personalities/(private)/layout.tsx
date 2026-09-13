import App from "../App";

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <App />
      {children}
    </>
  );
}
