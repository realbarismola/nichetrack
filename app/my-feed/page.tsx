'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function UserFeedPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_posts')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_utc', { ascending: false })
        .limit(30);

      if (!error && data) setPosts(data);
      setLoading(false);
    };

    fetchPosts();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-center">Your Feed</h1>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <p className="text-center text-gray-600">
          No posts found. Try adding subreddits to track.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <Card key={post.id} className="hover:shadow-xl transition-shadow rounded-xl">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <Badge className="lowercase bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    {post.subreddit}
                  </Badge>
                  <span>
                    {formatDistanceToNow(new Date(post.created_utc), { addSuffix: true })}
                  </span>
                </div>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-semibold hover:underline"
                >
                  {post.title}
                </a>
                <div className="text-sm text-gray-500 flex gap-4">
                  <span>💬 {post.num_comments}</span>
                  <span>⬆️ {post.score}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
