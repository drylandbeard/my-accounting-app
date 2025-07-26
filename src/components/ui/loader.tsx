import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const loaderVariants = cva(
  "flex items-center justify-center",
  {
    variants: {
      size: {
        sm: "h-1.5 w-1.5",
        md: "h-3 w-3",
        lg: "h-4 w-4",
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
    VariantProps<typeof dotVariants> {}

function Loader({
  className,
  size,
  variant,
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
            transform: scale(1);
          }
          40% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
        .dot-pulse {
          animation: dotPulse 1s ease-in-out infinite;
        }
      `}</style>
      <div
        className={cn(
          dotVariants({ size, variant }),
          "dot-pulse"
        )}
      />
    </div>
  )
}

export { Loader, loaderVariants }
export default Loader