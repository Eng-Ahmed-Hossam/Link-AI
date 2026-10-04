import { OwnerSessionRecord } from '@/owner/screens/Sessions';

export default async function Page({ params }: { params: Promise<{ recordId: string }> }) {
  return <OwnerSessionRecord recordId={(await params).recordId} />;
}
