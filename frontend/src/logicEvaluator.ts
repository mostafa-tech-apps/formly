import type { VisibilityLogic, VisibilityGroup, VisibilityRule } from './types';

export function evaluateLogic(
  logic: VisibilityLogic, 
  answers: Record<string, string>, 
  files: Record<string, File>
): boolean {
  if (!logic) return true; // No rules = visible by default

  const evalGroup = (group: VisibilityGroup): boolean => {
    if (!group.conditions || group.conditions.length === 0) return true;
    
    if (group.operator === 'AND') {
      return group.conditions.every(cond => 
        cond.type === 'group' ? evalGroup(cond) : evalRule(cond)
      );
    } 
    
    if (group.operator === 'OR') {
      return group.conditions.some(cond => 
        cond.type === 'group' ? evalGroup(cond) : evalRule(cond)
      );
    }
    
    if (group.operator === 'NOT') {
      return group.conditions.every(cond => 
        !(cond.type === 'group' ? evalGroup(cond) : evalRule(cond))
      );
    }

    return true;
  };

  const evalRule = (rule: VisibilityRule): boolean => {
    const qId = rule.questionId;
    const ans = answers[qId] || '';
    const hasFile = !!files[qId];
    const val = rule.value || '';

    switch (rule.operator) {
      case 'equals':
        return ans === val;
      case 'not_equals':
        return ans !== val;
      case 'contains':
        return ans.toLowerCase().includes(val.toLowerCase());
      case 'not_contains':
        return !ans.toLowerCase().includes(val.toLowerCase());
      case 'includes': // Exact match for multiple choice usually, but acts same as equals if single select
        return ans === val;
      case 'not_includes':
        return ans !== val;
      case 'is_empty':
        if (hasFile) return false;
        return !ans.trim();
      case 'is_not_empty':
        if (hasFile) return true;
        return !!ans.trim();
      default:
        return true;
    }
  };

  return evalGroup(logic);
}
