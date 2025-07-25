import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const loaderVariants = cva(
  "flex items-center justify-center gap-1",
  {
    variants: {
      size: {
        sm: "gap-1",
        md: "gap-1.5",
        lg: "gap-2",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

const dotVariants = cva(
  "rounded-full",
  {
    variants: {
      size: {
        sm: "h-1.5 w-1.5",
        md: "h-3 w-3", 
        lg: "h-4 w-4",
      },
      variant: {
        default: "bg-primary",
        muted: "bg-muted-foreground",
        accent: "bg-accent-foreground",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
)

interface LoaderProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loaderVariants>,
    VariantProps<typeof dotVariants> {
  dots?: number
}

function Loader({
  className,
  size,
  variant,
  dots = 3,
  ...props
}: LoaderProps) {
  return (
    <div
      className={cn(loaderVariants({ size, className }))}
      {...props}
    >
      <style jsx>{`
        @keyframes dotPulse {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          40% {
            opacity: 1;
            transform: scale(1.1);
          }
        }
        .dot-pulse {
          animation: dotPulse 1.4s ease-in-out infinite;
        }
      `}</style>
      {Array.from({ length: dots }).map((_, index) => (
        <div
          key={index}
          className={cn(
            dotVariants({ size, variant }),
            "dot-pulse"
          )}
          style={{
            animationDelay: `${index * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}

export { Loader, loaderVariants }
export default Loader