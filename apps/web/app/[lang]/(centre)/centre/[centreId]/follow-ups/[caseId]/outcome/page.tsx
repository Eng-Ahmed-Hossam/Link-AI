import { Suspense } from 'react';
import { OwnerOutcome } from '@/owner/screens/Outcome';

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return (
    <Suspense>
      <OwnerOutcome caseId={caseId} />
    </Suspense>
  );
}
