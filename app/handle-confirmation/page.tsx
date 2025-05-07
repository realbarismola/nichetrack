'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HandleConfirmationPage() {
  const router = useRouter();

  useEffect(() => {
    const confirmSession = async () => {
      const { error } = await (supabase.auth as any).getSessionFromUrl();      // should now work!
      if (!error) {
        router.push('/my-subreddits');
      }
    };

    confirmSession();
  }, []);

  return <p className="text-center mt-20">Logging you in...</p>;
}
