'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'

type Props={children:ReactNode;className?:string;onSuccess?:()=>void}
type AuthCompleteMessage={type:'auth_complete';success:boolean;error?:{message?:string}}
const POPUP_NAME='fastlane-auth0-login'

export function PopupLoginButton({children,className,onSuccess}:Props){
 const router=useRouter()
 const{invalidate}=useUser()
 const popupRef=useRef<Window|null>(null)
 const finish=useCallback(async()=>{await invalidate();router.refresh();onSuccess?.()},[invalidate,onSuccess,router])
 useEffect(()=>{function receive(event:MessageEvent<AuthCompleteMessage>){if(event.origin!==window.location.origin||event.source!==popupRef.current||event.data?.type!=='auth_complete')return;popupRef.current=null;if(event.data.success)void finish();else window.alert(event.data.error?.message??'Đăng nhập không thành công. Vui lòng thử lại.')}window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)},[finish])
 function login(){const width=520,height=720,left=Math.max(0,window.screenX+(window.outerWidth-width)/2),top=Math.max(0,window.screenY+(window.outerHeight-height)/2);popupRef.current=window.open('/auth/login?challengeMode=popup&returnTo=%2F',POPUP_NAME,`popup=yes,width=${width},height=${height},left=${left},top=${top}`);if(!popupRef.current)window.alert('Trình duyệt đang chặn cửa sổ đăng nhập. Vui lòng cho phép popup cho trang này.');else popupRef.current.focus()}
 return <button type="button" onClick={login} className={className}>{children}</button>
}