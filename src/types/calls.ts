export interface AudioCallParticipant {
 user_id:string;
 media_identity:string;
 state:'invited'|'joined'|'left'|'declined';
 blocked:boolean;
 heartbeat_at:string;
 display_name:string;
}
export interface AudioCall {
 initialMode?:'audio'|'video';
 id:string;
 conversation_id:string;
 caller_id:string;
 kind:'direct'|'group';
 state:'ringing'|'active'|'ended';
 end_reason:'ended'|'cancelled'|'declined'|'missed'|'busy'|'abandoned'|'removed'|null;
 created_at:string;
 started_at:string|null;
 ended_at:string|null;
 participants:AudioCallParticipant[];
 title:string;
 caller_name:string;
 current_user_is_admin:boolean;
}
