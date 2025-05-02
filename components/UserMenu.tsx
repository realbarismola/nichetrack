'use client';

import { useUser } from '@/app/context/UserProvider';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function UserMenu() {
  const { user } = useUser();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="absolute top-4 right-4 space-x-2">
      {user ? (
        <>
          <span className="text-sm text-gray-700">Logged in as {user.email}</span>
          <Button onClick={handleLogout} variant="outline" size="sm">
            Logout
          </Button>
        </>
      ) : (
        <Link href="/login">
          <Button variant="default" size="sm">
            Log In
          </Button>
        </Link>
      )}
    </div>
  );
}
