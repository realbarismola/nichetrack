import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Home,
  TrendingUp,
  Settings,
  BookMarked,
  Layout,
  Menu,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';

const menuItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/my-feed', label: 'My Feed', icon: Layout },
  { path: '/my-subreddits', label: 'Subreddits', icon: TrendingUp },
  { path: '/bookmarks', label: 'Bookmarks', icon: BookMarked },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.div
      initial={{ width: 240 }}
      animate={{ width: isCollapsed ? 80 : 240 }}
      className="h-screen bg-card border-r flex flex-col"
    >
      <div className="p-4 flex justify-between items-center">
        {!isCollapsed && <h1 className="text-xl font-bold">NicheTrack</h1>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            
            return (
              <li key={item.path}>
                <Link href={item.path}>
                  <span
                    className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {!isCollapsed && <span>{item.label}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </motion.div>
  );
}