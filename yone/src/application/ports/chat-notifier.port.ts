export interface ChatMessage {
  /** Named webhook target; resolved to a URL inside the adapter, never supplied by callers. */
  target: string;
  text: string;
  title?: string;
}

// Implemented once per chat platform (Slack, Teams); each use-case depends on its own instance.
export interface ChatNotifierPort {
  post(message: ChatMessage): Promise<void>;
}
