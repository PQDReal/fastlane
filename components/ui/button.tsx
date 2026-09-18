import * as React from 'react'
import {Slot} from '@radix-ui/react-slot'
import {cva,type VariantProps} from 'class-variance-authority'
import {cn} from '../../lib/utils'

const styles = cva(
  'inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow',
        gold: 'bg-gold text-white hover:bg-[#745500] shadow-sm hover:shadow-glow',
        outline: 'border border-slate-200 bg-white/50 backdrop-blur-sm text-slate-700 hover:bg-slate-100/80 hover:text-slate-900',
      },
      size: {
        default: 'h-11 px-7 text-sm',
        sm: 'h-9 px-5 text-xs',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof styles>{asChild?:boolean}
export function Button({className,variant,size,asChild=false,...props}:ButtonProps){const Comp=asChild?Slot:'button';return <Comp className={cn(styles({variant,size,className}))} suppressHydrationWarning {...props}/>}
