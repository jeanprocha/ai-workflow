import { InboxView } from "@/components/chat/inbox-view";

export default async function PublicInboxPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InboxView inboxToken={token} />;
}
