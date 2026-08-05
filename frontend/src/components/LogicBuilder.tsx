import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { Question, VisibilityLogic, VisibilityGroup, VisibilityRule, RuleOperator, LogicGroupOperator } from '../types';
import { parseOptions } from '../types';

interface LogicBuilderProps {
  logic: VisibilityLogic;
  onChange: (logic: VisibilityLogic) => void;
  previousQuestions: Question[];
}

const DEFAULT_GROUP: VisibilityGroup = {
  type: 'group',
  operator: 'AND',
  conditions: []
};

export default function LogicBuilder({ logic, onChange, previousQuestions }: LogicBuilderProps) {
  if (previousQuestions.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
        Conditional logic can only be based on questions that appear before this one. Move this question down to enable logic.
      </div>
    );
  }

  if (!logic) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => onChange({ ...DEFAULT_GROUP })}>
          <Plus size={16} /> Add Visibility Logic
        </button>
      </div>
    );
  }

  return (
    <div className="logic-builder" style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Visibility Conditions</h4>
        <button className="btn-icon" onClick={() => onChange(null)} style={{ color: 'var(--red)', width: 24, height: 24 }}>
          <Trash2 size={14} />
        </button>
      </div>
      <LogicGroupNode 
        group={logic} 
        onChange={onChange} 
        previousQuestions={previousQuestions} 
        isRoot={true} 
      />
    </div>
  );
}

interface GroupNodeProps {
  group: VisibilityGroup;
  onChange: (group: VisibilityGroup) => void;
  previousQuestions: Question[];
  isRoot?: boolean;
}

function LogicGroupNode({ group, onChange, previousQuestions, isRoot }: GroupNodeProps) {
  const addRule = () => {
    const newRule: VisibilityRule = {
      type: 'rule',
      questionId: previousQuestions[0].id,
      operator: 'equals',
      value: ''
    };
    onChange({ ...group, conditions: [...group.conditions, newRule] });
  };

  const addGroup = () => {
    const newGroup: VisibilityGroup = {
      type: 'group',
      operator: 'AND',
      conditions: []
    };
    onChange({ ...group, conditions: [...group.conditions, newGroup] });
  };

  const updateCondition = (index: number, newCondition: VisibilityRule | VisibilityGroup | null) => {
    const newConditions = [...group.conditions];
    if (newCondition === null) {
      newConditions.splice(index, 1);
    } else {
      newConditions[index] = newCondition;
    }
    onChange({ ...group, conditions: newConditions });
  };

  return (
    <div className="logic-group" style={{ 
      borderLeft: isRoot ? 'none' : '2px solid var(--primary)', 
      paddingLeft: isRoot ? 0 : '1rem',
      marginLeft: isRoot ? 0 : '0.5rem',
      marginTop: '0.5rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <select 
          className="select select-sm" 
          value={group.operator} 
          onChange={e => onChange({ ...group, operator: e.target.value as LogicGroupOperator })}
          style={{ width: '80px', fontWeight: 600 }}
        >
          <option value="AND">AND</option>
          <option value="OR">OR</option>
          <option value="NOT">NOT</option>
        </select>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {group.operator === 'NOT' ? 'all of the following are false:' : 'the following are true:'}
        </div>
      </div>

      <div className="logic-conditions" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {group.conditions.map((cond, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {cond.type === 'group' ? (
                <LogicGroupNode 
                  group={cond} 
                  onChange={newGroup => updateCondition(i, newGroup)} 
                  previousQuestions={previousQuestions} 
                />
              ) : (
                <LogicRuleNode 
                  rule={cond} 
                  onChange={newRule => updateCondition(i, newRule)} 
                  previousQuestions={previousQuestions} 
                />
              )}
            </div>
            <button className="btn-icon" onClick={() => updateCondition(i, null)} style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}>
              <X size={14} />
            </button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={addRule}>
            <Plus size={14} /> Add Rule
          </button>
          <button className="btn btn-ghost btn-sm" onClick={addGroup}>
            <Plus size={14} /> Add Group
          </button>
        </div>
      </div>
    </div>
  );
}

interface RuleNodeProps {
  rule: VisibilityRule;
  onChange: (rule: VisibilityRule) => void;
  previousQuestions: Question[];
}

function LogicRuleNode({ rule, onChange, previousQuestions }: RuleNodeProps) {
  const targetQ = previousQuestions.find(q => q.id === rule.questionId);
  
  // Filter options based on target question type
  const ops = useMemo(() => {
    if (!targetQ) return [];
    if (targetQ.type === 'text') return ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'];
    if (targetQ.type === 'multiple_choice') return ['equals', 'not_equals', 'includes', 'not_includes', 'is_empty', 'is_not_empty'];
    if (targetQ.type === 'file_upload') return ['is_empty', 'is_not_empty'];
    return [];
  }, [targetQ]);

  // Adjust operator if invalid for new question type
  const handleQuestionChange = (qId: string) => {
    const q = previousQuestions.find(x => x.id === qId);
    let newOp = rule.operator;
    let newVal = rule.value;
    
    if (q) {
      if (q.type === 'file_upload') newOp = 'is_empty';
      else if (newOp !== 'is_empty' && newOp !== 'is_not_empty') {
         if (q.type === 'multiple_choice' && newOp === 'contains') newOp = 'includes';
      }
      if (q.type === 'multiple_choice') newVal = ''; // reset on MC change
    }
    onChange({ ...rule, questionId: qId, operator: newOp as RuleOperator, value: newVal });
  };

  const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator);

  return (
    <div className="logic-rule" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
      <select 
        className="select select-sm" 
        value={rule.questionId} 
        onChange={e => handleQuestionChange(e.target.value)}
        style={{ flex: 1, minWidth: '150px' }}
      >
        {previousQuestions.map(q => (
          <option key={q.id} value={q.id}>{q.label || '(Untitled)'}</option>
        ))}
      </select>

      <select 
        className="select select-sm" 
        value={rule.operator} 
        onChange={e => onChange({ ...rule, operator: e.target.value as RuleOperator })}
        style={{ width: '130px' }}
      >
        {ops.includes('equals') && <option value="equals">is equal to</option>}
        {ops.includes('not_equals') && <option value="not_equals">is not equal to</option>}
        {ops.includes('contains') && <option value="contains">contains</option>}
        {ops.includes('not_contains') && <option value="not_contains">does not contain</option>}
        {ops.includes('includes') && <option value="includes">includes</option>}
        {ops.includes('not_includes') && <option value="not_includes">does not include</option>}
        {ops.includes('is_empty') && <option value="is_empty">is empty / not provided</option>}
        {ops.includes('is_not_empty') && <option value="is_not_empty">is not empty / provided</option>}
      </select>

      {needsValue && targetQ && (
        <div style={{ flex: 1, minWidth: '150px' }}>
          {targetQ.type === 'multiple_choice' ? (
            <select 
              className="select select-sm" 
              value={rule.value || ''} 
              onChange={e => onChange({ ...rule, value: e.target.value })}
            >
              <option value="" disabled>Select option...</option>
              {parseOptions(targetQ.options).map((opt, i) => (
                <option key={i} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input 
              className="input input-sm" 
              value={rule.value || ''} 
              onChange={e => onChange({ ...rule, value: e.target.value })} 
              placeholder="Value..."
            />
          )}
        </div>
      )}
    </div>
  );
}
