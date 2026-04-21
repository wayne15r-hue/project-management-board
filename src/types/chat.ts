export type ConversationType = "direct" | "group" | "board";
export type MessageType =
  | "text"
  | "file"
  | "image"
  | "voice"
  | "system"
  | "card_link";

export interface ChatProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  board_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  members: ChatProfile[];
  last_message: {
    content: string | null;
    message_type: MessageType;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
  current_user_is_admin: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: MessageType;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at?: string | null;
  created_at: string;
  sender?: ChatProfile | null;
}
