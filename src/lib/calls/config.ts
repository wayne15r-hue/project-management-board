export function callConfiguration() {
 const url=process.env.LIVEKIT_URL?.trim();
 const key=process.env.LIVEKIT_API_KEY?.trim();
 const secret=process.env.LIVEKIT_API_SECRET?.trim();
 if(!url||!key||!secret||!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())return null;
 try {
  const parsed=new URL(url);
  // Revocation is a Cloud feature; do not silently weaken it on other servers.
  if(parsed.protocol!=='wss:'||!parsed.hostname.endsWith('.livekit.cloud')||parsed.username||parsed.password||parsed.search)return null;
  return {url,key,secret,httpUrl:url.replace(/^wss:/,'https:'),enabled:process.env.AUDIO_CALLS_ENABLED==='true',groupEnabled:process.env.GROUP_AUDIO_ENABLED==='true',videoEnabled:process.env.VIDEO_CALLS_ENABLED==='true',screenShareEnabled:process.env.SCREEN_SHARING_ENABLED==='true'};
 } catch{return null;}
}
