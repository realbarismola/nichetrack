'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, ArrowUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type RedditPost = {
  id: string;
  user_id: string;
  subreddit: string;
  title: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: string;
};

export default function UserFeedPage() {
  const [posts, setPosts] = useState<RedditPost[]>([]);
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
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      ) : posts.length === 0 ? (
        <p className="text-center text-gray-600">
          No posts found. Try adding subreddits to track.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Card key={post.id} className="hover:shadow-xl transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <Badge>{post.subreddit}</Badge>
                  <span>
                    {formatDistanceToNow(new Date(post.created_utc), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-medium hover:underline block"
                >
                  {post.title}
                </a>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" /> {post.num_comments}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUp className="w-4 h-4" /> {post.score}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
