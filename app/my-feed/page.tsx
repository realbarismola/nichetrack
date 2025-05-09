'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '../../components/ui/badge';
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
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">Your Feed</h1>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <p className="text-gray-600">No posts found. Try adding subreddits to track.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id} className="border shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge>{post.subreddit}</Badge>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(post.created_utc), { addSuffix: true })}
                  </span>
                </div>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-medium hover:underline"
                >
                  {post.title}
                </a>
                <div className="text-sm text-gray-500">
                  💬 {post.num_comments} | ⬆️ {post.score}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
