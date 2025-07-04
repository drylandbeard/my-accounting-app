import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Toast utilities that match the current notification styling
export const showSuccessToast = (message: string) => {
  toast.success(message, {
    style: {
      background: '#dcfce7', // bg-green-100
      color: '#166534', // text-green-800
      border: '1px solid #bbf7d0', // border-green-300
      fontSize: '14px',
      fontWeight: '500',
    },
  })
}

export const showErrorToast = (message: string) => {
  toast.error(message, {
    style: {
      background: '#fecaca', // bg-red-100
      color: '#991b1b', // text-red-800
      border: '1px solid #fca5a5', // border-red-300
      fontSize: '14px',
      fontWeight: '500',
    },
  })
}
