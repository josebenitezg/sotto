import { ReviewPage } from "@/components/workspace";
import { connectionErrorMessage } from "@/lib/connection-errors";
export const metadata = { title: "Inbox · Sotto" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ connection_error?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      {params.connection_error ? (
        <p role="alert" className="mb-6 text-small text-destructive">
          {connectionErrorMessage(params.connection_error)}
        </p>
      ) : null}
      <ReviewPage />
    </>
  );
}
