'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HandleConfirmationPage() {
  const router = useRouter();

  useEffect(() => {
    const confirmSession = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.auth as any).getSessionFromUrl();
      if (!error) {
        router.push('/my-subreddits');
      }
    };

    confirmSession();
  }, [router]); // ✅ also fixes the dependency warning

  return <p className="text-center mt-20">Logging you in...</p>;
}
