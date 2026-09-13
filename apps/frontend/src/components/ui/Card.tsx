import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden transition-all hover:border-gray-700',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
