'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { startOfToday } from "date-fns";

// Define TypeScript type for trend objects
type Trend = {
  id: number;
  title: string;
  description: string;
  category: string;
  ideas: string[];
};

export default function HomePage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkSession();
  }, []);

  useEffect(() => {
    async function fetchTrends() {
      const today = startOfToday().toISOString();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        const { data, error } = await supabase
          .from("trends")
          .select("*")
          .gte("created_at", today)
          .order("created_at", { ascending: false });

        if (!error) setTrends(data || []);
        return;
      }

      const { data, error } = await supabase
        .from("user_trends")
        .select("*")
        .eq("user_id", session.user.id)
        .gte("created_at", today)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching user trends:", error);
      } else {
        setTrends(data || []);
      }
    }

    fetchTrends();
  }, []);

  const filteredTrends = trends.filter((trend) => {
    const matchesCategory = activeCategory === "all" || trend.category === activeCategory;
    const matchesSearch = trend.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="text-center space-y-2">
        <h1 className="text-4xl font-bold">NicheTrack</h1>
        <p className="text-lg text-gray-600">
          Discover emerging micro-niches before they go mainstream
        </p>
        {isLoggedIn && (
          <div className="mt-4">
            <Button onClick={() => router.push('/my-subreddits')}>
              Go to My Subreddits
            </Button>
          </div>
        )}
      </header>

      <section className="flex items-center gap-2">
        <Input
          placeholder="Search niches..."
          className="flex-1"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button>Search</Button>
      </section>

      <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="travel">Travel</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="tech">Tech</TabsTrigger>
        </TabsList>

        <TabsContent value={activeCategory}>
          {filteredTrends.length === 0 ? (
            <p className="text-center text-gray-500">No trends found for your selected subreddits yet. Please check back later.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTrends.map((trend) => (
                <Card key={trend.id} className="hover:shadow-xl transition-shadow">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      Trending
                    </div>
                    <h3 className="text-xl font-semibold">{trend.title}</h3>
                    <p className="text-sm text-gray-600">{trend.description}</p>
                    <ul className="text-sm list-disc pl-4 text-gray-500">
                      {trend.ideas.map((idea, i) => (
                        <li key={i}>{idea}</li>
                      ))}
                    </ul>
                    <Button className="w-full mt-2" variant="outline">
                      Save to Favorites
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
