// app/login/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Assuming this is your initialized Supabase client
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // 1. Check if user is ALREADY logged in when the page loads
    const checkInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('Login Page: User already has a session, redirecting to /my-subreddits');
        router.push('/my-subreddits');
      }
    };

    checkInitialSession();

    // 2. Listen for successful sign-in events triggered by the <Auth> component
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Login Page: onAuthStateChange event:', event, 'session:', session);
        if (event === 'SIGNED_IN') {
          console.log('Login Page: SIGNED_IN event received, redirecting to /my-subreddits');
          router.push('/my-subreddits');
        }
        // You might also want to handle other events like 'SIGNED_OUT' if needed,
        // though typically sign out would happen elsewhere.
      }
    );

    // Cleanup listener on component unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router]); // router dependency is fine

  return (
    <div className="flex items-center justify-center min-h-screen"> {/* Centering the form */}
      <div className="w-full max-w-md p-6 border rounded-xl shadow-sm bg-white"> {/* Added bg-white for clarity */}
        <h1 className="text-2xl font-semibold mb-6 text-center">Log in or Sign up</h1> {/* Increased mb */}
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]} // No social providers
          theme="light"
          // The redirectTo here is primarily for magic links or OAuth callbacks.
          // For password sign-in with the Auth UI, the onAuthStateChange listener is key.
          // If you enable email confirmation, this redirectTo will be where the user lands
          // AFTER clicking the confirmation link in their email.
          redirectTo={typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined}
        />
      </div>
    </div>
  );
}