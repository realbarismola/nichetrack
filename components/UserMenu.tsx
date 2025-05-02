'use client';

import { useUser } from '@/app/context/UserProvider';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function UserMenu() {
  const { user } = useUser();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="absolute top-4 right-4 space-x-2">
      <span className="text-sm text-gray-700">Logged in as {user.email}</span>
      <Button onClick={handleLogout} variant="outline" size="sm">
        Logout
      </Button>
    </div>
  );
}
