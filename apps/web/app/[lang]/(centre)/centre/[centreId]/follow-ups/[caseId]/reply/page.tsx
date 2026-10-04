import { Suspense } from 'react';
import { OwnerReply } from '@/owner/screens/Reply';

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return (
    <Suspense>
      <OwnerReply caseId={caseId} />
    </Suspense>
  );
}
