import { Suspense } from 'react';
import { CentreSignIn } from '@/owner/screens/CentreSignIn';

/** Centre entry: sign in, then the person's own centre (`?next=` keeps the page a link asked for). */
export default function CentreEntryPage() {
  return (
    <Suspense>
      <CentreSignIn />
    </Suspense>
  );
}
