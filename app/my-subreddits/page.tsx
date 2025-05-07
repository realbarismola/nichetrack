'use client';

import { useUser } from '@/app/context/UserProvider';
import { supabase } from '@/lib/supabaseClient';
import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Subreddit = {
  id: string;
  subreddit: string;
  created_at: string;
};

export default function MySubredditsPage() {
  const { user } = useUser();
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [newSubreddit, setNewSubreddit] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSubreddits = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_subreddits')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch subreddits:', error);
    } else {
      setSubreddits(data || []);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) fetchSubreddits();
  }, [user, fetchSubreddits]);

  const handleAdd = async () => {
    if (!newSubreddit) return;

    setLoading(true);
    const { error } = await supabase.from('user_subreddits').insert([
      {
        user_id: user?.id,
        subreddit: newSubreddit.trim(),
      },
    ]);

    setLoading(false);
    setNewSubreddit('');
    if (!error) fetchSubreddits();
    else console.error('Error adding subreddit:', error);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('user_subreddits').delete().eq('id', id);
    if (!error) fetchSubreddits();
  };

  if (!user) return <p className="p-4">You must be logged in to manage subreddits.</p>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Your Subreddits</h1>

      <div className="flex gap-2">
        <Input
          placeholder="e.g. indiebiz"
          value={newSubreddit}
          onChange={(e) => setNewSubreddit(e.target.value)}
        />
        <Button onClick={handleAdd} disabled={loading}>
          Add
        </Button>
      </div>

      <ul className="space-y-2">
        {subreddits.map((item) => (
          <li
            key={item.id}
            className="flex justify-between items-center p-3 rounded border bg-white shadow-sm"
          >
            <span className="text-sm text-gray-800">r/{item.subreddit}</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(item.id)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
