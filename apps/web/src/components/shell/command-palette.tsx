"use client";

import { useEffect, useState } from "react";
import { Plus, Workflow, Boxes, ListChecks, LayoutTemplate, Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/nav";
import { useGlobalSearch } from "@/hooks/use-search";
import { useDictionary } from "@/lib/i18n";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const { data: results, isFetching } = useGlobalSearch(debouncedQuery);
  const t = useDictionary();

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasResults =
    !!results &&
    (results.workflows.length > 0 ||
      results.nodes.length > 0 ||
      results.executions.length > 0 ||
      results.templates.length > 0 ||
      results.agents.length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t.shell.commandPalette.dialogTitle}
      description={t.shell.commandPalette.dialogDescription}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t.shell.commandPalette.inputPlaceholder}
      />
      {/* cmdk usa a prop `label` (nao `aria-label`) pra nomear a lista —
          sem isso o role="listbox" se anunciava como "Suggestions",
          hardcoded em ingles pelo cmdk, numa UI pt-BR. */}
      <CommandList label={t.shell.commandPalette.resultsAria}>
        {hasQuery && !isFetching && !hasResults && (
          <CommandEmpty>{t.shell.commandPalette.empty}</CommandEmpty>
        )}

        {results && results.workflows.length > 0 && (
          <CommandGroup heading={t.shell.commandPalette.groupFlows}>
            {results.workflows.map((workflow) => (
              <CommandItem key={workflow.id} onSelect={() => go(`/flows/${workflow.id}`)}>
                <Workflow className="h-4 w-4" strokeWidth={1.5} />
                {workflow.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.nodes.length > 0 && (
          <CommandGroup heading={t.shell.commandPalette.groupNodes}>
            {results.nodes.map((node) => (
              <CommandItem
                key={`${node.workflowId}-${node.nodeId}`}
                onSelect={() => go(`/flows/${node.workflowId}`)}
              >
                <Boxes className="h-4 w-4" strokeWidth={1.5} />
                {node.nodeLabel}
                <span className="ml-auto text-xs text-muted-foreground">
                  {node.workflowName}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.executions.length > 0 && (
          <CommandGroup heading={t.shell.commandPalette.groupExecutions}>
            {results.executions.map((execution) => (
              <CommandItem key={execution.id} onSelect={() => go(`/executions/${execution.id}`)}>
                <ListChecks className="h-4 w-4" strokeWidth={1.5} />
                {execution.workflowName}
                <span className="ml-auto text-xs text-muted-foreground">{execution.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.templates.length > 0 && (
          <CommandGroup heading={t.shell.commandPalette.groupTemplates}>
            {results.templates.map((template) => (
              <CommandItem key={template.id} onSelect={() => go("/templates")}>
                <LayoutTemplate className="h-4 w-4" strokeWidth={1.5} />
                {template.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results && results.agents.length > 0 && (
          <CommandGroup heading={t.shell.commandPalette.groupAgents}>
            {results.agents.map((agent) => (
              <CommandItem key={agent.id} onSelect={() => go("/agents")}>
                <Bot className="h-4 w-4" strokeWidth={1.5} />
                {agent.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!hasQuery && (
          <>
            <CommandGroup heading={t.shell.commandPalette.quickActions}>
              <CommandItem onSelect={() => go("/flows/new")}>
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                {t.shell.commandPalette.createFlow}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t.shell.commandPalette.navigate}>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={item.href} onSelect={() => go(item.href)}>
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                    {t.nav[item.key]}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
