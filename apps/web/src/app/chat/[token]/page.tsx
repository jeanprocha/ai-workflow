import { ChatConversation } from "@/components/chat/chat-conversation";

export default async function PublicChatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ChatConversation chatToken={token} />;
}
