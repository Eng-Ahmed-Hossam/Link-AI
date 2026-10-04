import { OwnerStudent } from '@/owner/screens/Student';

export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
  return <OwnerStudent studentId={(await params).studentId} />;
}
