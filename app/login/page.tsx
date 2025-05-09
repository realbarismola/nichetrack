'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/my-feed');
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN') {
          router.push('/my-feed');
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-6 border rounded-xl shadow-sm bg-white">
        <h1 className="text-2xl font-semibold mb-6 text-center">Log in or Sign up</h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          theme="light"
          redirectTo={typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined}
        />
      </div>
    </div>
  );
}
