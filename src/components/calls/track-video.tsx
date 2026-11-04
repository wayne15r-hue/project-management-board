"use client";
import {useEffect,useRef} from 'react';
import type {Track} from 'livekit-client';
export function TrackVideo({track,mirror=false,label}:{track:Track;mirror?:boolean;label:string}){
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{const element=ref.current;if(!element)return;track.attach(element);return ()=>{track.detach(element);element.srcObject=null;};},[track]);
 return <video ref={ref} aria-label={label} autoPlay playsInline muted className="h-full max-h-[48vh] w-full object-contain" style={mirror?{transform:'scaleX(-1)'}:undefined}/>;
}
