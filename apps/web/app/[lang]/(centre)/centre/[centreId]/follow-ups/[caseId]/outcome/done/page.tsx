import { OwnerOutcomeDone } from '@/owner/screens/Outcome';

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  return <OwnerOutcomeDone caseId={(await params).caseId} />;
}
