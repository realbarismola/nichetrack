import React from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
