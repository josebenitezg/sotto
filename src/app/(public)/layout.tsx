import { PublicFooter, PublicHeader } from "@/components/public-shell";
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-site">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
