'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push('/my-subreddits');
      }
    };

    checkSession();
  }, [router]);

  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded-xl shadow-sm">
      <h1 className="text-2xl font-semibold mb-4 text-center">Log in or Sign up</h1>
      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        providers={[]}
        theme="light"
        redirectTo={`${process.env.NEXT_PUBLIC_SITE_URL}/handle-confirmation`}
      />
    </div>
  );
}
