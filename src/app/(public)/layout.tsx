import { PublicFooter, PublicHeader } from "@/components/public-shell";
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-site">
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
