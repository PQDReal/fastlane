import type { SalesAgentInteractionOption } from './interaction'

export const SALES_AGENT_INTERACTION_VISIBLE_OPTIONS = 4

export function getVisibleSalesAgentInteractionOptions(
  options: SalesAgentInteractionOption[],
  selectedOptionIds: string[],
  expanded: boolean,
) {
  if (expanded || options.length <= SALES_AGENT_INTERACTION_VISIBLE_OPTIONS) return options
  const visible = options.slice(0, SALES_AGENT_INTERACTION_VISIBLE_OPTIONS)
  const visibleIds = new Set(visible.map((option) => option.optionId))
  const selectedIds = new Set(selectedOptionIds)
  return [
    ...visible,
    ...options.filter((option) => selectedIds.has(option.optionId) && !visibleIds.has(option.optionId)),
  ]
}
