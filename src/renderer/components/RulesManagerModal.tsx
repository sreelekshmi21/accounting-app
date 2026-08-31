import React, { useState, useEffect } from 'react';
import type {
  MappingRuleRecord,
  FSLIRecord,
  MappingRuleInput,
} from '../../electron-api';
import FSLIManagerModal from './FSLIManagerModal';

interface RulesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fslis: FSLIRecord[];
  onRulesChanged: () => void;
}

export default function RulesManagerModal({
  isOpen,
  onClose,
  fslis,
  onRulesChanged,
}: RulesManagerModalProps) {
  const [rules, setRules] = useState<MappingRuleRecord[]>([]);
  const [fsliList, setFsliList] = useState<FSLIRecord[]>(fslis);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingRule, setEditingRule] = useState<MappingRuleRecord | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [fsliManagerOpen, setFsliManagerOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState<{
    ruleName: string;
    priority: number;
    field: string;
    operator: string;
    value: string;
    targetFSLIId: string;
    confidence: number;
    scope: 'Global' | 'Client' | 'Entity';
  }>({
    ruleName: '',
    priority: 10,
    field: 'tally_group',
    operator: 'equals',
    value: '',
    targetFSLIId: '',
    confidence: 0.95,
    scope: 'Global',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.listAllMappingRules) {
        const res = await window.electronAPI.listAllMappingRules();
        setRules(res);
      } else {
        // Fallback for preview
        setRules([]);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFsliList(fslis);
  }, [fslis]);

  useEffect(() => {
    if (isOpen) {
      loadRules();
      setEditingRule(null);
      setIsCreating(false);
    }
  }, [isOpen]);

  const handleToggleActive = async (rule: MappingRuleRecord) => {
    try {
      const nextActive = !rule.active;
      if (window.electronAPI?.toggleMappingRuleActive) {
        await window.electronAPI.toggleMappingRuleActive(rule.id, nextActive);
      }
      setRules(rules.map((r) => (r.id === rule.id ? { ...r, active: nextActive } : r)));
      showToast(`Rule "${rule.ruleName}" ${nextActive ? 'enabled' : 'disabled'}`);
      onRulesChanged();
    } catch (err: any) {
      showToast(err?.message || 'Failed to toggle rule state');
    }
  };

  const handleDeleteRule = async (rule: MappingRuleRecord) => {
    if (!window.confirm(`Are you sure you want to delete rule "${rule.ruleName}"?`)) {
      return;
    }
    try {
      if (window.electronAPI?.deleteMappingRule) {
        await window.electronAPI.deleteMappingRule(rule.id);
      }
      setRules(rules.filter((r) => r.id !== rule.id));
      showToast(`Deleted rule "${rule.ruleName}"`);
      onRulesChanged();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete rule');
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingRule(null);
    setForm({
      ruleName: '',
      priority: 10,
      field: 'tally_group',
      operator: 'equals',
      value: '',
      targetFSLIId: fsliList[0]?.id || '',
      confidence: 0.95,
      scope: 'Global',
    });
  };

  const handleStartEdit = (rule: MappingRuleRecord) => {
    setEditingRule(rule);
    setIsCreating(false);
    const cond = (rule.conditions as any)?.rules?.[0] || {
      field: 'tally_group',
      operator: 'equals',
      value: '',
    };
    setForm({
      ruleName: rule.ruleName,
      priority: rule.priority,
      field: cond.field || 'tally_group',
      operator: cond.operator || 'equals',
      value: cond.value || '',
      targetFSLIId: rule.targetFSLIId || (fsliList[0]?.id || ''),
      confidence: rule.confidence,
      scope: rule.scope,
    });
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ruleName.trim() || !form.value.trim() || !form.targetFSLIId) {
      showToast('Please fill in all required fields.');
      return;
    }

    try {
      const conditions = {
        type: 'AND',
        rules: [{ field: form.field, operator: form.operator, value: form.value }],
      };

      if (isCreating) {
        if (window.electronAPI?.createMappingRule) {
          await window.electronAPI.createMappingRule({
            ruleName: form.ruleName,
            priority: Number(form.priority) || 10,
            conditions,
            action: 'map_to_fsli',
            targetFSLIId: form.targetFSLIId,
            confidence: Number(form.confidence) || 0.95,
            scope: form.scope,
            createdBy: 'User',
          });
        }
        showToast(`Created rule "${form.ruleName}"`);
      } else if (editingRule) {
        if (window.electronAPI?.updateMappingRule) {
          await window.electronAPI.updateMappingRule(editingRule.id, {
            ruleName: form.ruleName,
            priority: Number(form.priority) || 10,
            conditions,
            action: 'map_to_fsli',
            targetFSLIId: form.targetFSLIId,
            confidence: Number(form.confidence) || 0.95,
            scope: form.scope,
          });
        }
        showToast(`Updated rule "${form.ruleName}"`);
      }

      setIsCreating(false);
      setEditingRule(null);
      await loadRules();
      onRulesChanged();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save rule');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content rules-manager-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="rules-modal-title-area">
            <h2>User Mapping Rules Manager</h2>
            <span className="rules-modal-sub">
              Manage custom deterministic mapping rules with priority & multi-scope evaluation.
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Toast */}
        {toast && <div className="rules-manager-toast">{toast}</div>}

        {/* Content Body */}
        <div className="rules-manager-body">
          {/* List or Form Header Button */}
          {!isCreating && !editingRule && (
            <div className="rules-top-bar">
              <span className="rules-count-text">
                <strong>{rules.length}</strong> configured rule(s)
              </span>
              <button className="btn btn-primary btn-sm" onClick={handleStartCreate}>
                + Add New Rule
              </button>
            </div>
          )}

          {/* Form View (Create or Edit) */}
          {(isCreating || editingRule) ? (
            <form onSubmit={handleSaveForm} className="rule-editor-form">
              <div className="form-legend">
                {isCreating ? 'Create New Mapping Rule' : `Edit Rule: "${editingRule?.ruleName}"`}
              </div>

              <div className="form-group">
                <label>Rule Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Map Agricultural Sundry Creditors"
                  value={form.ruleName}
                  onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Priority (Higher = Evaluated First)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Scope</label>
                  <select
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value as any })}
                    className="form-input"
                  >
                    <option value="Global">Global (All Entities)</option>
                    <option value="Client">Client-Specific</option>
                    <option value="Entity">Entity-Specific</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Confidence Score</label>
                  <select
                    value={form.confidence}
                    onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })}
                    className="form-input"
                  >
                    <option value={1.0}>100% (Definite)</option>
                    <option value={0.95}>95% (High)</option>
                    <option value={0.85}>85% (Standard)</option>
                    <option value={0.75}>75% (Moderate)</option>
                  </select>
                </div>
              </div>

              {/* Conditions Box */}
              <div className="rule-condition-box">
                <div className="condition-box-title">Rule Condition Match Criteria</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Match Field</label>
                    <select
                      value={form.field}
                      onChange={(e) => setForm({ ...form, field: e.target.value })}
                      className="form-input"
                    >
                      <option value="tally_group">Tally Group</option>
                      <option value="parent_group">Parent Group</option>
                      <option value="ledger_name">Ledger Name Keyword</option>
                      <option value="balance_nature">Balance Nature (Debit/Credit)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Operator</label>
                    <select
                      value={form.operator}
                      onChange={(e) => setForm({ ...form, operator: e.target.value })}
                      className="form-input"
                    >
                      <option value="equals">Equals Exactly</option>
                      <option value="contains">Contains Substring</option>
                      <option value="starts_with">Starts With</option>
                      <option value="ends_with">Ends With</option>
                      <option value="matches_regex">Regex Pattern</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Match Value *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sundry Creditors or Salary"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Target FSLI Selection */}
              <div className="form-group">
                <div className="fsli-label-action-row">
                  <label>Target FSLI Line Item *</label>
                  <button
                    type="button"
                    className="btn-link-action"
                    onClick={() => setFsliManagerOpen(true)}
                  >
                    ⚙ Manage / + Add FSLI
                  </button>
                </div>
                <select
                  value={form.targetFSLIId}
                  onChange={(e) => setForm({ ...form, targetFSLIId: e.target.value })}
                  className="form-input"
                  required
                >
                  <option value="">-- Select Target FSLI --</option>
                  {fsliList.map((f) => (
                    <option key={f.id} value={f.id}>
                      [{f.category}] {f.fsliName} ({f.fsliCode || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingRule(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isCreating ? 'Create Rule' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            /* Rules Table / Cards View */
            <div className="rules-list-container">
              {loading ? (
                <div className="rules-empty-state">Loading mapping rules...</div>
              ) : rules.length === 0 ? (
                <div className="rules-empty-state">
                  <p>No user-defined mapping rules found.</p>
                  <button className="btn btn-primary btn-sm" onClick={handleStartCreate}>
                    + Create Your First Rule
                  </button>
                </div>
              ) : (
                <table className="rules-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Active</th>
                      <th>Rule Name</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Priority</th>
                      <th style={{ width: '90px' }}>Scope</th>
                      <th>Condition</th>
                      <th>Target FSLI</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>Conf</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => {
                      const cond = (rule.conditions as any)?.rules?.[0];
                      const targetF = fsliList.find((f) => f.id === rule.targetFSLIId);

                      return (
                        <tr key={rule.id} className={!rule.active ? 'rule-disabled-row' : ''}>
                          {/* Toggle Active Switch */}
                          <td>
                            <label className="switch-toggle" title={rule.active ? 'Active' : 'Disabled'}>
                              <input
                                type="checkbox"
                                checked={rule.active}
                                onChange={() => handleToggleActive(rule)}
                              />
                              <span className="slider-round"></span>
                            </label>
                          </td>

                          {/* Rule Name */}
                          <td>
                            <span className="rule-table-name">{rule.ruleName}</span>
                          </td>

                          {/* Priority */}
                          <td style={{ textAlign: 'center' }}>
                            <span className="priority-tag">P{rule.priority}</span>
                          </td>

                          {/* Scope */}
                          <td>
                            <span className={`scope-badge scope-${rule.scope.toLowerCase()}`}>
                              {rule.scope}
                            </span>
                          </td>

                          {/* Condition */}
                          <td>
                            {cond ? (
                              <code className="condition-pill">
                                {cond.field} {cond.operator} "{cond.value}"
                              </code>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Target FSLI */}
                          <td>
                            {targetF ? (
                              <div className="rule-target-fsli">
                                <span className="fsli-main">{targetF.fsliName}</span>
                                <span className="fsli-sub-cat">{targetF.category}</span>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Confidence */}
                          <td style={{ textAlign: 'center' }}>
                            <span className="conf-micro">{Math.round(rule.confidence * 100)}%</span>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'right' }}>
                            <div className="rule-row-actions">
                              <button
                                className="action-btn action-change"
                                onClick={() => handleStartEdit(rule)}
                                title="Edit rule"
                              >
                                ✎ Edit
                              </button>
                              <button
                                className="action-btn action-reject"
                                onClick={() => handleDeleteRule(rule)}
                                title="Delete rule"
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Embedded FSLI Master Management Modal */}
      <FSLIManagerModal
        isOpen={fsliManagerOpen}
        onClose={() => setFsliManagerOpen(false)}
        onFSLIChanged={async () => {
          onRulesChanged();
          if (window.electronAPI?.listFSLIs) {
            const updated = await window.electronAPI.listFSLIs();
            setFsliList(updated);
          }
        }}
        onFSLICreated={(newFSLI) => {
          setFsliList((prev) => (prev.some((p) => p.id === newFSLI.id) ? prev : [...prev, newFSLI]));
          setForm((prev) => ({ ...prev, targetFSLIId: newFSLI.id }));
          showToast(`Selected newly created FSLI: "${newFSLI.fsliName}"`);
        }}
      />
    </div>
  );
}
