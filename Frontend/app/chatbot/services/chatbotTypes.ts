
export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  text?: string;
  isUser?: boolean;
  timestamp?: Date;
  message_type?: string;
  created_at?: string;
  model_used?: string;
  attached_files?: ConversationFile[];
}

export interface ConversationFile {
  id: string;
  doc_id?: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  is_processed: boolean;
  processing_status: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  is_pinned: boolean;
  icon: string;
  summary: string;
  messages: Message[];
  attached_files: ConversationFile[];
  message_count: number;
  last_message: {
    content: string;
    created_at: string;
    message_type: string;
  } | null;
}

export interface ChatResponse {
  content: string;
  source: string;
  conversation_id: string;
  message_id: string;
}

export default {};
