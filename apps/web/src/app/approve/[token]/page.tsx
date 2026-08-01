import { ApprovalDecisionView } from "@/components/approvals/approval-decision-view";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ApprovalDecisionView token={token} />;
}
