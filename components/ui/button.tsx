import * as React from 'react'
import {Slot} from '@radix-ui/react-slot'
import {cva,type VariantProps} from 'class-variance-authority'
import {cn} from '../../lib/utils'
const styles=cva('inline-flex items-center justify-center rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue disabled:pointer-events-none disabled:opacity-50',{variants:{variant:{default:'bg-blue text-white hover:bg-navy',gold:'bg-gold text-white hover:bg-[#745500]',outline:'border border-navy bg-white text-navy hover:bg-mist'},size:{default:'h-11 px-7 text-sm',sm:'h-9 px-5 text-xs',icon:'h-10 w-10'}},defaultVariants:{variant:'default',size:'default'}})
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof styles>{asChild?:boolean}
export function Button({className,variant,size,asChild=false,...props}:ButtonProps){const Comp=asChild?Slot:'button';return <Comp className={cn(styles({variant,size,className}))}{...props}/>}
