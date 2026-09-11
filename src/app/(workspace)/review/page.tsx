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
        <p
          role="alert"
          className="mb-6 rounded-sm border border-destructive/40 px-3 py-2.5 text-[13px] leading-[18px] text-destructive"
        >
          The connection did not complete. Try again and allow access to Gmail.
        </p>
      ) : null}
      <ReviewPage />
    </>
  );
}
