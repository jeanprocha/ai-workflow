import { Injectable } from '@nestjs/common';
import type { WorkflowGraph } from '@workflow/shared';
import { PrismaService } from '../prisma/prisma.service';

const LIMIT = 5;

export interface SearchResults {
  workflows: Array<{ id: string; name: string }>;
  nodes: Array<{
    workflowId: string;
    workflowName: string;
    nodeId: string;
    nodeLabel: string;
  }>;
  executions: Array<{
    id: string;
    workflowName: string;
    status: string;
    startedAt: Date;
  }>;
  templates: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(workspaceId: string, query: string): Promise<SearchResults> {
    const q = query.trim();
    if (!q) {
      return {
        workflows: [],
        nodes: [],
        executions: [],
        templates: [],
        agents: [],
      };
    }

    const [
      workflowMatches,
      workflowsForNodes,
      executionMatches,
      templateMatches,
      agentMatches,
    ] = await Promise.all([
      this.prisma.workflow.findMany({
        where: { workspaceId, name: { contains: q, mode: 'insensitive' } },
        take: LIMIT,
        select: { id: true, name: true },
      }),
      this.prisma.workflow.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          currentVersion: { select: { graph: true } },
        },
      }),
      this.prisma.execution.findMany({
        where: {
          workflow: { workspaceId, name: { contains: q, mode: 'insensitive' } },
        },
        orderBy: { startedAt: 'desc' },
        take: LIMIT,
        select: {
          id: true,
          status: true,
          startedAt: true,
          workflow: { select: { name: true } },
        },
      }),
      this.prisma.template.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        take: LIMIT,
        select: { id: true, name: true },
      }),
      this.prisma.agent.findMany({
        where: { workspaceId, name: { contains: q, mode: 'insensitive' } },
        take: LIMIT,
        select: { id: true, name: true },
      }),
    ]);

    const nodes: SearchResults['nodes'] = [];
    const lowerQuery = q.toLowerCase();
    for (const workflow of workflowsForNodes) {
      const graph = workflow.currentVersion?.graph as unknown as
        WorkflowGraph | undefined;
      if (!graph) continue;
      for (const node of graph.nodes) {
        if (node.label.toLowerCase().includes(lowerQuery)) {
          nodes.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            nodeId: node.id,
            nodeLabel: node.label,
          });
          if (nodes.length >= LIMIT) break;
        }
      }
      if (nodes.length >= LIMIT) break;
    }

    return {
      workflows: workflowMatches,
      nodes,
      executions: executionMatches.map((execution) => ({
        id: execution.id,
        workflowName: execution.workflow.name,
        status: execution.status,
        startedAt: execution.startedAt,
      })),
      templates: templateMatches,
      agents: agentMatches,
    };
  }
}
