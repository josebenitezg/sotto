import { ReviewPage } from "@/components/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ connection_error?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      {params.connection_error ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive"
        >
          The connection did not complete. Choose an enabled account and allow
          access to Gmail.
        </div>
      ) : null}
      <ReviewPage />
    </>
  );
}
