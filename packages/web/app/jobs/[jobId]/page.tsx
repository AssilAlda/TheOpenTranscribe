import { JobDetailFallbackPage } from "@/components/JobDetailFallbackPage";

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const { jobId } = await params;
  return <JobDetailFallbackPage jobId={jobId} />;
}
