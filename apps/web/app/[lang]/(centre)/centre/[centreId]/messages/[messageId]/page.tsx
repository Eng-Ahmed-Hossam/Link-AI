import { OwnerMessage } from '@/owner/screens/Message';

export default async function Page({ params }: { params: Promise<{ messageId: string }> }) {
  return <OwnerMessage messageId={(await params).messageId} />;
}
