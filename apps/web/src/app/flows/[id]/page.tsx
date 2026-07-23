import { FlowEditor } from "@/components/editor/flow-editor";

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowEditor workflowId={id} />;
}
