import { OwnerCase } from '@/owner/screens/Case';

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  return <OwnerCase caseId={(await params).caseId} />;
}
