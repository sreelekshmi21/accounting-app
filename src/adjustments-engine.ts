/**
 * Adjustments Engine (Phase 8)
 *
 * Dedicated, auditable accounting-adjustment layer that operates AFTER Phase 7 Regrouping.
 *
 * Data flow:
 *   Original Trial Balance
 *   → Phase 5 Mapping
 *   → Phase 6 Classification
 *   → Phase 7 Regrouping
 *   → Phase 8 Adjustments
 *   → Phase 9 Consolidation & Interbranch Elimination
 *   → Financial Statements
 *
 * Important rules:
 * 1. Immutability: Phase 8 NEVER modifies the Original Trial Balance, Phase 5 mappings,
 *    Phase 6 classifications, or Phase 7 regrouping records.
 * 2. Double-Entry: Total Debit = Total Credit for every adjustment. Minimum 2 lines.
 * 3. Closing Stock: Uses canonical FSLIs CA_INVENT (Dr Asset) and EXP_CHG_INV (Cr Operating Expense reduction).
 * 4. Workflow: Draft → PendingReview → Approved → Applied (or PendingReview → Rejected).
 * 5. Return to Draft: Approved adjustments may only return to Draft with mandatory reason & audit.
 * 6. Immutability on Apply: Applied adjustments cannot be edited or deleted. Corrections must proceed
 *    via Reversal (creating a linked inverse entry).
 * 7. Deletion: Only permitted for Draft adjustments.
 * 8. Unit & CY/PY Isolation: Adjustments are strictly unit- and financial-year-specific.
 *
 * This module must ONLY be imported in the main process.
 */

import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type {
  AdjustmentType,
  AdjustmentStatus,
  AdjustmentRecord,
  AdjustmentLineRecord,
  AdjustmentAuditRecord,
  CreateAdjustmentInput,
  CreateAdjustmentLineInput,
  UpdateAdjustmentInput,
  AdjustmentsWorkbenchSummary,
  AdjustmentsWorkbenchData,
  AdjustedTrialBalanceData,
  AdjustedTrialBalanceRow,
  FSLIRecord,
} from './electron-api';

// ── Validation Helpers ────────────────────────────────────────────────────────

export interface DoubleEntryValidationResult {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  error?: string;
}

export function validateDoubleEntry(lines: CreateAdjustmentLineInput[]): DoubleEntryValidationResult {
  if (!lines || lines.length < 2) {
    return {
      valid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      error: 'An adjustment entry must contain at least 2 journal lines.',
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dr = Number(line.debit) || 0;
    const cr = Number(line.credit) || 0;

    if (dr < 0 || cr < 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        error: `Line ${i + 1}: Debit and credit amounts cannot be negative.`,
      };
    }

    if (dr === 0 && cr === 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        error: `Line ${i + 1}: Line must have either a debit or credit amount.`,
      };
    }

    if (dr > 0 && cr > 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        error: `Line ${i + 1}: A single line cannot have both debit and credit amounts.`,
      };
    }

    if (!line.fsliId || line.fsliId.trim() === '') {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        error: `Line ${i + 1}: FSLI is required.`,
      };
    }

    if (!line.ledgerName || line.ledgerName.trim() === '') {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        difference: 0,
        error: `Line ${i + 1}: Ledger name is required.`,
      };
    }

    totalDebit += dr;
    totalCredit += cr;
  }

  // Round to 4 decimal places to prevent floating point inaccuracies
  totalDebit = Math.round(totalDebit * 10000) / 10000;
  totalCredit = Math.round(totalCredit * 10000) / 10000;
  const diff = Math.round(Math.abs(totalDebit - totalCredit) * 10000) / 10000;

  if (totalDebit <= 0) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      difference: diff,
      error: 'Total adjustment amount must be greater than zero.',
    };
  }

  if (diff > 0.001) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      difference: diff,
      error: `Adjustment is unbalanced! Total Debit (₹${totalDebit.toFixed(2)}) must equal Total Credit (₹${totalCredit.toFixed(2)}). Difference: ₹${diff.toFixed(2)}.`,
    };
  }

  return {
    valid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

// ── Number Generator ──────────────────────────────────────────────────────────

export function generateAdjustmentNumber(
  database: Database.Database,
  financialYearId: string,
): string {
  const fyRow = database
    .prepare('SELECT year_label FROM FinancialYear WHERE id = ?')
    .get(financialYearId) as { year_label: string } | undefined;

  const yearClean = fyRow ? fyRow.year_label.replace(/[^0-9a-zA-Z]/g, '') : 'FY';

  const countRow = database
    .prepare('SELECT COUNT(*) as cnt FROM Adjustment WHERE financial_year_id = ?')
    .get(financialYearId) as { cnt: number } | undefined;

  const seq = (countRow?.cnt || 0) + 1;
  const seqStr = String(seq).padStart(3, '0');
  return `ADJ-${yearClean}-${seqStr}`;
}

// ── Audit Logging Helper ──────────────────────────────────────────────────────

function logAdjustmentAudit(
  database: Database.Database,
  adjustmentId: string,
  action: 'Created' | 'Edited' | 'Submitted' | 'Approved' | 'Rejected' | 'ReturnedToDraft' | 'Applied' | 'Reversed' | 'Deleted',
  beforeStatus: string | null,
  afterStatus: string | null,
  performedBy: string = 'System',
  reason?: string | null,
  details?: string | null,
): void {
  const id = `adjaudit-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO AdjustmentAudit (
      id, adjustment_id, action, before_status, after_status,
      details, reason, performed_by, performed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    adjustmentId,
    action,
    beforeStatus,
    afterStatus,
    details || null,
    reason || null,
    performedBy,
    now,
  );
}

// ── Core Lifecycle Functions ──────────────────────────────────────────────────

/**
 * Creates a new Adjustment in Draft status.
 */
export function createAdjustment(
  database: Database.Database,
  input: CreateAdjustmentInput,
): AdjustmentRecord {
  // Validate Unit & Financial Year
  const unitRow = database.prepare('SELECT id, entity_id FROM Unit WHERE id = ?').get(input.unitId) as { id: string; entity_id: string } | undefined;
  if (!unitRow) throw new Error(`Unit with ID ${input.unitId} not found.`);

  const fyRow = database.prepare('SELECT id, year_label FROM FinancialYear WHERE id = ?').get(input.financialYearId) as { id: string; year_label: string } | undefined;
  if (!fyRow) throw new Error(`Financial Year with ID ${input.financialYearId} not found.`);

  if (!input.narration || input.narration.trim() === '') {
    throw new Error('Narration is mandatory for all adjustments.');
  }

  // Double entry validation
  const validation = validateDoubleEntry(input.lines);
  if (!validation.valid) {
    throw new Error(`Double-entry validation failed: ${validation.error}`);
  }

  const adjId = `adj-${crypto.randomUUID()}`;
  const adjNumber = generateAdjustmentNumber(database, input.financialYearId);
  const now = new Date().toISOString();
  const dateStr = input.adjustmentDate || now.split('T')[0];
  const createdBy = input.createdBy || 'User';

  const isClosingStock = input.isClosingStock ? 1 : 0;
  const closingStockVal = input.closingStockValue || (isClosingStock ? validation.totalDebit : null);

  const insertAdj = database.prepare(`
    INSERT INTO Adjustment (
      id, adjustment_number, entity_id, unit_id, financial_year_id,
      adjustment_date, adjustment_type, narration, status,
      total_debit, total_credit, is_closing_stock, closing_stock_value,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLine = database.prepare(`
    INSERT INTO AdjustmentLine (
      id, adjustment_id, line_number, ledger_id, ledger_name,
      fsli_id, fsli_name, fsli_code, fsli_category,
      debit, credit, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Run in a single transaction
  const tx = database.transaction(() => {
    insertAdj.run(
      adjId,
      adjNumber,
      unitRow.entity_id,
      input.unitId,
      input.financialYearId,
      dateStr,
      input.adjustmentType || 'Other Adjustment',
      input.narration.trim(),
      validation.totalDebit,
      validation.totalCredit,
      isClosingStock,
      closingStockVal,
      createdBy,
      now,
      now,
    );

    input.lines.forEach((line, index) => {
      const lineId = `adjline-${crypto.randomUUID()}`;
      const fsliRow = database.prepare('SELECT id, fsli_name, fsli_code, category FROM FSLI WHERE id = ?').get(line.fsliId) as { id: string; fsli_name: string; fsli_code: string; category: string } | undefined;

      const fsliName = fsliRow ? fsliRow.fsli_name : 'Unknown FSLI';
      const fsliCode = fsliRow ? fsliRow.fsli_code : null;
      const fsliCat = fsliRow ? fsliRow.category : null;

      insertLine.run(
        lineId,
        adjId,
        index + 1,
        line.ledgerId || null,
        line.ledgerName.trim(),
        line.fsliId,
        fsliName,
        fsliCode,
        fsliCat,
        Number(line.debit) || 0,
        Number(line.credit) || 0,
        line.description ? line.description.trim() : null,
      );
    });

    logAdjustmentAudit(
      database,
      adjId,
      'Created',
      null,
      'Draft',
      createdBy,
      'Adjustment created in Draft status',
      JSON.stringify({ totalDebit: validation.totalDebit, lineCount: input.lines.length }),
    );
  });

  tx();

  return getAdjustmentById(database, adjId)!;
}

/**
 * Updates an existing Draft adjustment.
 */
export function updateAdjustment(
  database: Database.Database,
  id: string,
  input: UpdateAdjustmentInput,
): AdjustmentRecord {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'Draft') {
    throw new Error(
      `Cannot edit adjustment ${current.adjustmentNumber} with status "${current.status}". Only Draft adjustments can be edited.`,
    );
  }

  const unitId = input.unitId || current.unitId;
  const fyId = input.financialYearId || current.financialYearId;
  const narration = input.narration !== undefined ? input.narration.trim() : current.narration;
  const adjDate = input.adjustmentDate || current.adjustmentDate;
  const adjType = input.adjustmentType || current.adjustmentType;
  const updatedBy = input.updatedBy || 'User';

  if (!narration) {
    throw new Error('Narration is mandatory for all adjustments.');
  }

  const linesToUse = input.lines || current.lines.map((l) => ({
    ledgerId: l.ledgerId,
    ledgerName: l.ledgerName,
    fsliId: l.fsliId,
    debit: l.debit,
    credit: l.credit,
    description: l.description || undefined,
  }));

  const validation = validateDoubleEntry(linesToUse);
  if (!validation.valid) {
    throw new Error(`Double-entry validation failed: ${validation.error}`);
  }

  const isClosingStock = input.isClosingStock !== undefined ? (input.isClosingStock ? 1 : 0) : (current.isClosingStock ? 1 : 0);
  const closingStockVal = input.closingStockValue !== undefined ? input.closingStockValue : current.closingStockValue;
  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE Adjustment SET
        unit_id = ?,
        financial_year_id = ?,
        adjustment_date = ?,
        adjustment_type = ?,
        narration = ?,
        total_debit = ?,
        total_credit = ?,
        is_closing_stock = ?,
        closing_stock_value = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      unitId,
      fyId,
      adjDate,
      adjType,
      narration,
      validation.totalDebit,
      validation.totalCredit,
      isClosingStock,
      closingStockVal,
      now,
      id,
    );

    // Replace lines
    database.prepare('DELETE FROM AdjustmentLine WHERE adjustment_id = ?').run(id);

    const insertLine = database.prepare(`
      INSERT INTO AdjustmentLine (
        id, adjustment_id, line_number, ledger_id, ledger_name,
        fsli_id, fsli_name, fsli_code, fsli_category,
        debit, credit, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    linesToUse.forEach((line, index) => {
      const lineId = `adjline-${crypto.randomUUID()}`;
      const fsliRow = database.prepare('SELECT id, fsli_name, fsli_code, category FROM FSLI WHERE id = ?').get(line.fsliId) as { id: string; fsli_name: string; fsli_code: string; category: string } | undefined;

      insertLine.run(
        lineId,
        id,
        index + 1,
        line.ledgerId || null,
        line.ledgerName.trim(),
        line.fsliId,
        fsliRow ? fsliRow.fsli_name : 'Unknown FSLI',
        fsliRow ? fsliRow.fsli_code : null,
        fsliRow ? fsliRow.category : null,
        Number(line.debit) || 0,
        Number(line.credit) || 0,
        line.description ? line.description.trim() : null,
      );
    });

    logAdjustmentAudit(
      database,
      id,
      'Edited',
      'Draft',
      'Draft',
      updatedBy,
      'Adjustment details updated',
      JSON.stringify({ totalDebit: validation.totalDebit, lineCount: linesToUse.length }),
    );
  });

  tx();

  return getAdjustmentById(database, id)!;
}

/**
 * Deletes an adjustment. ONLY permitted for Draft adjustments.
 */
export function deleteAdjustment(database: Database.Database, id: string): boolean {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'Draft') {
    throw new Error(
      `Cannot delete adjustment ${current.adjustmentNumber} with status "${current.status}". Deletion is strictly restricted to Draft adjustments only.`,
    );
  }

  const tx = database.transaction(() => {
    database.prepare('DELETE FROM AdjustmentLine WHERE adjustment_id = ?').run(id);
    database.prepare('DELETE FROM AdjustmentAudit WHERE adjustment_id = ?').run(id);
    database.prepare('DELETE FROM Adjustment WHERE id = ?').run(id);
  });

  tx();
  return true;
}

/**
 * Submits a Draft adjustment for review.
 */
export function submitAdjustmentForReview(
  database: Database.Database,
  id: string,
  submittedBy: string = 'User',
): AdjustmentRecord {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'Draft') {
    throw new Error(`Only Draft adjustments can be submitted for review. Current status is "${current.status}".`);
  }

  const validation = validateDoubleEntry(current.lines);
  if (!validation.valid) {
    throw new Error(`Cannot submit unbalanced adjustment: ${validation.error}`);
  }

  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE Adjustment SET
        status = 'PendingReview',
        submitted_by = ?,
        submitted_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(submittedBy, now, now, id);

    logAdjustmentAudit(
      database,
      id,
      'Submitted',
      'Draft',
      'PendingReview',
      submittedBy,
      'Submitted for review and approval',
    );
  });

  tx();

  return getAdjustmentById(database, id)!;
}

/**
 * Approves a PendingReview adjustment.
 */
export function approveAdjustment(
  database: Database.Database,
  id: string,
  approvedBy: string = 'Approver',
): AdjustmentRecord {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'PendingReview') {
    throw new Error(`Only PendingReview adjustments can be approved. Current status is "${current.status}".`);
  }

  const validation = validateDoubleEntry(current.lines);
  if (!validation.valid) {
    throw new Error(`Cannot approve unbalanced adjustment: ${validation.error}`);
  }

  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE Adjustment SET
        status = 'Approved',
        approved_by = ?,
        approved_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(approvedBy, now, now, id);

    logAdjustmentAudit(
      database,
      id,
      'Approved',
      'PendingReview',
      'Approved',
      approvedBy,
      'Adjustment approved',
    );
  });

  tx();

  return getAdjustmentById(database, id)!;
}

/**
 * Rejects a PendingReview adjustment with a mandatory reason.
 */
export function rejectAdjustment(
  database: Database.Database,
  id: string,
  reason: string,
  rejectedBy: string = 'Reviewer',
): AdjustmentRecord {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'PendingReview') {
    throw new Error(`Only PendingReview adjustments can be rejected. Current status is "${current.status}".`);
  }

  if (!reason || reason.trim() === '') {
    throw new Error('A reason is mandatory when rejecting an adjustment.');
  }

  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE Adjustment SET
        status = 'Rejected',
        rejected_by = ?,
        rejected_at = ?,
        rejection_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(rejectedBy, now, reason.trim(), now, id);

    logAdjustmentAudit(
      database,
      id,
      'Rejected',
      'PendingReview',
      'Rejected',
      rejectedBy,
      reason.trim(),
    );
  });

  tx();

  return getAdjustmentById(database, id)!;
}

/**
 * Returns an Approved adjustment back to Draft with a mandatory reason.
 */
export function returnAdjustmentToDraft(
  database: Database.Database,
  id: string,
  reason: string,
  returnedBy: string = 'User',
): AdjustmentRecord {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'Approved') {
    throw new Error(`Only Approved adjustments can be returned to Draft. Current status is "${current.status}".`);
  }

  if (!reason || reason.trim() === '') {
    throw new Error('A mandatory reason must be provided to return an approved adjustment to Draft.');
  }

  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE Adjustment SET
        status = 'Draft',
        updated_at = ?
      WHERE id = ?
    `).run(now, id);

    logAdjustmentAudit(
      database,
      id,
      'ReturnedToDraft',
      'Approved',
      'Draft',
      returnedBy,
      reason.trim(),
    );
  });

  tx();

  return getAdjustmentById(database, id)!;
}

/**
 * Applies an Approved adjustment. Marks it Applied and immutable.
 */
export function applyAdjustment(
  database: Database.Database,
  id: string,
  appliedBy: string = 'User',
): AdjustmentRecord {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'Approved') {
    throw new Error(`Only Approved adjustments can be applied. Current status is "${current.status}".`);
  }

  const validation = validateDoubleEntry(current.lines);
  if (!validation.valid) {
    throw new Error(`Cannot apply unbalanced adjustment: ${validation.error}`);
  }

  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    database.prepare(`
      UPDATE Adjustment SET
        status = 'Applied',
        applied_by = ?,
        applied_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(appliedBy, now, now, id);

    logAdjustmentAudit(
      database,
      id,
      'Applied',
      'Approved',
      'Applied',
      appliedBy,
      'Adjustment applied to active financial data',
    );
  });

  tx();

  return getAdjustmentById(database, id)!;
}

/**
 * Reverses an Applied adjustment, creating a linked inverse entry.
 */
export function reverseAdjustment(
  database: Database.Database,
  id: string,
  reason: string,
  reversedBy: string = 'User',
): { original: AdjustmentRecord; reversal: AdjustmentRecord } {
  const current = getAdjustmentById(database, id);
  if (!current) throw new Error(`Adjustment with ID ${id} not found.`);

  if (current.status !== 'Applied') {
    throw new Error(`Only Applied adjustments can be reversed. Current status is "${current.status}".`);
  }

  if (!reason || reason.trim() === '') {
    throw new Error('A mandatory reason is required to reverse an applied adjustment.');
  }

  const reversalId = `adj-${crypto.randomUUID()}`;
  const reversalNumber = `${current.adjustmentNumber}-REV`;
  const now = new Date().toISOString();

  const tx = database.transaction(() => {
    // 1. Create reversal header with status 'Applied'
    database.prepare(`
      INSERT INTO Adjustment (
        id, adjustment_number, entity_id, unit_id, financial_year_id,
        adjustment_date, adjustment_type, narration, status,
        total_debit, total_credit, is_closing_stock, closing_stock_value,
        reversal_of_id, created_by, created_at, updated_at,
        approved_by, approved_at, applied_by, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Applied', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reversalId,
      reversalNumber,
      current.entityId,
      current.unitId,
      current.financialYearId,
      now.split('T')[0],
      current.adjustmentType,
      `Reversal of ${current.adjustmentNumber}: ${reason.trim()}`,
      current.totalCredit, // Swapped
      current.totalDebit,  // Swapped
      current.isClosingStock ? 1 : 0,
      current.closingStockValue,
      current.id,
      reversedBy,
      now,
      now,
      reversedBy,
      now,
      reversedBy,
      now,
    );

    // 2. Insert inverse lines: Debit becomes Credit, Credit becomes Debit
    const insertLine = database.prepare(`
      INSERT INTO AdjustmentLine (
        id, adjustment_id, line_number, ledger_id, ledger_name,
        fsli_id, fsli_name, fsli_code, fsli_category,
        debit, credit, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    current.lines.forEach((line, index) => {
      const revLineId = `adjline-${crypto.randomUUID()}`;
      insertLine.run(
        revLineId,
        reversalId,
        index + 1,
        line.ledgerId,
        line.ledgerName,
        line.fsliId,
        line.fsliName,
        line.fsliCode || null,
        line.fsliCategory || null,
        line.credit, // SWAPPED: original credit is now debit
        line.debit,  // SWAPPED: original debit is now credit
        line.description ? `Reversal: ${line.description}` : `Reversal of line ${index + 1}`,
      );
    });

    // 3. Mark original as 'Reversed'
    database.prepare(`
      UPDATE Adjustment SET
        status = 'Reversed',
        reversed_by = ?,
        reversed_at = ?,
        reversal_reason = ?,
        reversed_by_id = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      reversedBy,
      now,
      reason.trim(),
      reversalId,
      now,
      id,
    );

    // 4. Log audit on original
    logAdjustmentAudit(
      database,
      id,
      'Reversed',
      'Applied',
      'Reversed',
      reversedBy,
      reason.trim(),
      JSON.stringify({ reversalAdjustmentNumber: reversalNumber, reversalId }),
    );

    // 5. Log audit on reversal
    logAdjustmentAudit(
      database,
      reversalId,
      'Applied',
      null,
      'Applied',
      reversedBy,
      `Auto-applied reversal entry for ${current.adjustmentNumber}`,
      JSON.stringify({ originalAdjustmentId: id, originalAdjustmentNumber: current.adjustmentNumber }),
    );
  });

  tx();

  return {
    original: getAdjustmentById(database, id)!,
    reversal: getAdjustmentById(database, reversalId)!,
  };
}

// ── Dedicated Closing Stock Helper ────────────────────────────────────────────

/**
 * Creates a dedicated, unit-specific Closing Stock adjustment entry.
 *
 * Accounting Treatment:
 *   Debit:  Inventories (CA_INVENT) [Increases Balance Sheet Current Assets]
 *   Credit: Changes in Inventories (EXP_CHG_INV) [Reduces Operating Expenses in Trading/P&L]
 */
export function createClosingStockAdjustment(
  database: Database.Database,
  input: {
    unitId: string;
    financialYearId: string;
    adjustmentDate?: string;
    closingStockValue: number;
    inventoryFSLIId?: string;
    changesInInventoryFSLIId?: string;
    narration?: string;
    createdBy?: string;
  },
): AdjustmentRecord {
  if (!input.closingStockValue || input.closingStockValue <= 0) {
    throw new Error('Closing stock value must be greater than zero.');
  }

  // Look up canonical FSLIs CA_INVENT and EXP_CHG_INV
  let inventFSLIId = input.inventoryFSLIId;
  if (!inventFSLIId) {
    const row = database.prepare("SELECT id FROM FSLI WHERE fsli_code = 'CA_INVENT' OR fsli_name = 'Inventories' LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new Error("Canonical FSLI 'Inventories' (CA_INVENT) not found in FSLI catalog.");
    inventFSLIId = row.id;
  }

  let chgInventFSLIId = input.changesInInventoryFSLIId;
  if (!chgInventFSLIId) {
    const row = database.prepare("SELECT id FROM FSLI WHERE fsli_code = 'EXP_CHG_INV' OR fsli_name LIKE '%Changes in Inventories%' LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new Error("Canonical FSLI 'Changes in Inventories' (EXP_CHG_INV) not found in FSLI catalog.");
    chgInventFSLIId = row.id;
  }

  const narration = input.narration || `Closing Stock valuation adjustment for FY as on ${input.adjustmentDate || new Date().toISOString().split('T')[0]}`;

  return createAdjustment(database, {
    unitId: input.unitId,
    financialYearId: input.financialYearId,
    adjustmentDate: input.adjustmentDate || new Date().toISOString().split('T')[0],
    adjustmentType: 'Closing Stock',
    narration,
    isClosingStock: true,
    closingStockValue: input.closingStockValue,
    createdBy: input.createdBy || 'User',
    lines: [
      {
        ledgerName: 'Closing Stock (Inventories)',
        fsliId: inventFSLIId,
        debit: input.closingStockValue,
        credit: 0,
        description: 'Closing Stock added to Inventories (Current Assets)',
      },
      {
        ledgerName: 'Closing Stock (Trading / P&L)',
        fsliId: chgInventFSLIId,
        debit: 0,
        credit: input.closingStockValue,
        description: 'Closing Stock credited to Changes in Inventories (Expense credit)',
      },
    ],
  });
}

// ── Query Functions ───────────────────────────────────────────────────────────

export function getAdjustmentById(
  database: Database.Database,
  id: string,
): AdjustmentRecord | null {
  const row = database.prepare(`
    SELECT
      a.id, a.adjustment_number, a.entity_id, a.unit_id, u.unit_name,
      a.financial_year_id, fy.year_label as financial_year_label,
      a.adjustment_date, a.adjustment_type, a.narration, a.status,
      a.total_debit, a.total_credit, a.is_closing_stock, a.closing_stock_value,
      a.reversal_of_id, ro.adjustment_number as reversal_of_number,
      a.reversed_by_id, rb.adjustment_number as reversed_by_number,
      a.created_by, a.created_at, a.updated_at,
      a.submitted_by, a.submitted_at,
      a.approved_by, a.approved_at,
      a.rejected_by, a.rejected_at, a.rejection_reason,
      a.applied_by, a.applied_at,
      a.reversed_by, a.reversed_at, a.reversal_reason
    FROM Adjustment a
    JOIN Unit u ON a.unit_id = u.id
    JOIN FinancialYear fy ON a.financial_year_id = fy.id
    LEFT JOIN Adjustment ro ON a.reversal_of_id = ro.id
    LEFT JOIN Adjustment rb ON a.reversed_by_id = rb.id
    WHERE a.id = ?
  `).get(id) as {
    id: string;
    adjustment_number: string;
    entity_id: string;
    unit_id: string;
    unit_name: string | null;
    financial_year_id: string;
    financial_year_label: string | null;
    adjustment_date: string;
    adjustment_type: AdjustmentType;
    narration: string;
    status: AdjustmentStatus;
    total_debit: number;
    total_credit: number;
    is_closing_stock: number;
    closing_stock_value: number | null;
    reversal_of_id: string | null;
    reversal_of_number: string | null;
    reversed_by_id: string | null;
    reversed_by_number: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    submitted_by: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    applied_by: string | null;
    applied_at: string | null;
    reversed_by: string | null;
    reversed_at: string | null;
    reversal_reason: string | null;
  } | undefined;

  if (!row) return null;

  const lineRows = database.prepare(`
    SELECT
      id, adjustment_id, line_number, ledger_id, ledger_name,
      fsli_id, fsli_name, fsli_code, fsli_category,
      debit, credit, description
    FROM AdjustmentLine
    WHERE adjustment_id = ?
    ORDER BY line_number ASC
  `).all(id) as Array<{
    id: string;
    adjustment_id: string;
    line_number: number;
    ledger_id: string | null;
    ledger_name: string;
    fsli_id: string;
    fsli_name: string;
    fsli_code: string | null;
    fsli_category: string | null;
    debit: number;
    credit: number;
    description: string | null;
  }>;

  return {
    id: row.id,
    adjustmentNumber: row.adjustment_number,
    entityId: row.entity_id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    financialYearId: row.financial_year_id,
    financialYearLabel: row.financial_year_label,
    isCY: true,
    adjustmentDate: row.adjustment_date,
    adjustmentType: row.adjustment_type,
    narration: row.narration,
    status: row.status,
    totalDebit: row.total_debit,
    totalCredit: row.total_credit,
    isClosingStock: row.is_closing_stock === 1,
    closingStockValue: row.closing_stock_value,
    reversalOfId: row.reversal_of_id,
    reversalOfNumber: row.reversal_of_number,
    reversedById: row.reversed_by_id,
    reversedByNumber: row.reversed_by_number,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
    reversedBy: row.reversed_by,
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
    lines: lineRows.map((l) => ({
      id: l.id,
      adjustmentId: l.adjustment_id,
      lineNumber: l.line_number,
      ledgerId: l.ledger_id,
      ledgerName: l.ledger_name,
      fsliId: l.fsli_id,
      fsliName: l.fsli_name,
      fsliCode: l.fsli_code,
      fsliCategory: l.fsli_category,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    })),
  };
}

export function getAdjustmentAuditHistory(
  database: Database.Database,
  adjustmentId: string,
): AdjustmentAuditRecord[] {
  const rows = database.prepare(`
    SELECT
      aa.id, aa.adjustment_id, a.adjustment_number, aa.action,
      aa.before_status, aa.after_status, aa.details, aa.reason,
      aa.performed_by, aa.performed_at
    FROM AdjustmentAudit aa
    JOIN Adjustment a ON aa.adjustment_id = a.id
    WHERE aa.adjustment_id = ?
    ORDER BY aa.performed_at DESC
  `).all(adjustmentId) as Array<{
    id: string;
    adjustment_id: string;
    adjustment_number: string;
    action: AdjustmentAuditRecord['action'];
    before_status: string | null;
    after_status: string | null;
    details: string | null;
    reason: string | null;
    performed_by: string | null;
    performed_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    adjustmentId: r.adjustment_id,
    adjustmentNumber: r.adjustment_number,
    action: r.action,
    beforeStatus: r.before_status,
    afterStatus: r.after_status,
    details: r.details,
    reason: r.reason,
    performedBy: r.performed_by,
    performedAt: r.performed_at,
  }));
}

/**
 * Returns complete workbench data for Phase 8 Adjustments.
 */
export function getAdjustmentsWorkbenchData(
  database: Database.Database,
  financialYearId?: string,
  unitId?: string,
  typeFilter?: string,
  statusFilter?: string,
): AdjustmentsWorkbenchData {
  // 1. Fetch Financial Years
  const fyRows = database.prepare(`
    SELECT
      fy.id,
      fy.year_label,
      (SELECT COUNT(*) FROM LedgerBalance lb WHERE lb.financial_year_id = fy.id) as balance_count
    FROM FinancialYear fy
    ORDER BY fy.year_label DESC
  `).all() as Array<{ id: string; year_label: string; balance_count: number }>;

  if (fyRows.length === 0) {
    return {
      financialYears: [],
      activeFinancialYearId: '',
      activeFinancialYearLabel: '',
      units: [],
      fslis: [],
      availableLedgers: [],
      summary: {
        totalAdjustments: 0,
        draftCount: 0,
        pendingReviewCount: 0,
        approvedCount: 0,
        appliedCount: 0,
        rejectedCount: 0,
        reversedCount: 0,
        totalDebitApplied: 0,
        totalCreditApplied: 0,
      },
      adjustments: [],
    };
  }

  const activeFy = (financialYearId ? fyRows.find((f) => f.id === financialYearId) : null) ||
    fyRows.find((f) => f.balance_count > 0) ||
    fyRows[0];
  const activeFyId = activeFy.id;

  // 2. Fetch Units
  const units = database.prepare(`
    SELECT id, unit_name
    FROM Unit
    ORDER BY unit_name ASC
  `).all() as Array<{ id: string; unit_name: string }>;

  // 3. Fetch Active FSLIs (Mapped to camelCase FSLIRecord)
  const fsliRows = database.prepare(`
    SELECT id, fsli_name, fsli_code, category, sub_category, display_order, source, active, created_at, parent_fsli_id
    FROM FSLI
    WHERE active = 1
    ORDER BY display_order ASC, fsli_name ASC
  `).all() as Array<{
    id: string;
    fsli_name: string;
    fsli_code: string | null;
    category: string;
    sub_category: string | null;
    display_order: number;
    source: string | null;
    active: number;
    created_at: string;
    parent_fsli_id: string | null;
  }>;

  const fslis: FSLIRecord[] = fsliRows.map((r) => ({
    id: r.id,
    fsliName: r.fsli_name,
    fsliCode: r.fsli_code,
    category: r.category,
    subCategory: r.sub_category,
    displayOrder: r.display_order,
    source: (r.source as 'SYSTEM' | 'USER') || 'SYSTEM',
    active: r.active === 1,
    createdAt: r.created_at,
    parentFSLIId: r.parent_fsli_id,
  }));

  // 4. Fetch available Ledgers for autocomplete
  const availableLedgers = database.prepare(`
    SELECT DISTINCT l.id, l.ledger_name, l.unit_id, tg.group_name as tally_group_name
    FROM Ledger l
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    WHERE l.active = 1
    ORDER BY l.ledger_name ASC
  `).all() as Array<{ id: string; ledger_name: string; unit_id: string; tally_group_name: string | null }>;

  // 5. Query adjustments
  let query = `
    SELECT id FROM Adjustment
    WHERE financial_year_id = ?
  `;
  const params: unknown[] = [activeFyId];

  if (unitId && unitId !== 'ALL') {
    query += ' AND unit_id = ?';
    params.push(unitId);
  }
  if (typeFilter && typeFilter !== 'ALL') {
    query += ' AND adjustment_type = ?';
    params.push(typeFilter);
  }
  if (statusFilter && statusFilter !== 'ALL') {
    query += ' AND status = ?';
    params.push(statusFilter);
  }

  query += ' ORDER BY created_at DESC';

  const adjIdRows = database.prepare(query).all(...params) as Array<{ id: string }>;
  const adjustments: AdjustmentRecord[] = adjIdRows
    .map((r) => getAdjustmentById(database, r.id))
    .filter((a): a is AdjustmentRecord => a !== null);

  // 6. Compute KPIs across ALL adjustments for this FY (and unit if selected)
  let kpiQuery = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END) as draft_cnt,
      SUM(CASE WHEN status = 'PendingReview' THEN 1 ELSE 0 END) as review_cnt,
      SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved_cnt,
      SUM(CASE WHEN status = 'Applied' THEN 1 ELSE 0 END) as applied_cnt,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected_cnt,
      SUM(CASE WHEN status = 'Reversed' THEN 1 ELSE 0 END) as reversed_cnt,
      SUM(CASE WHEN status = 'Applied' THEN total_debit ELSE 0 END) as applied_dr,
      SUM(CASE WHEN status = 'Applied' THEN total_credit ELSE 0 END) as applied_cr
    FROM Adjustment
    WHERE financial_year_id = ?
  `;
  const kpiParams: unknown[] = [activeFyId];
  if (unitId && unitId !== 'ALL') {
    kpiQuery += ' AND unit_id = ?';
    kpiParams.push(unitId);
  }

  const kpiRow = database.prepare(kpiQuery).get(...kpiParams) as {
    total: number;
    draft_cnt: number;
    review_cnt: number;
    approved_cnt: number;
    applied_cnt: number;
    rejected_cnt: number;
    reversed_cnt: number;
    applied_dr: number;
    applied_cr: number;
  };

  const summary: AdjustmentsWorkbenchSummary = {
    totalAdjustments: kpiRow?.total || 0,
    draftCount: kpiRow?.draft_cnt || 0,
    pendingReviewCount: kpiRow?.review_cnt || 0,
    approvedCount: kpiRow?.approved_cnt || 0,
    appliedCount: kpiRow?.applied_cnt || 0,
    rejectedCount: kpiRow?.rejected_cnt || 0,
    reversedCount: kpiRow?.reversed_cnt || 0,
    totalDebitApplied: kpiRow?.applied_dr || 0,
    totalCreditApplied: kpiRow?.applied_cr || 0,
  };

  return {
    financialYears: fyRows.map((f) => ({ id: f.id, yearLabel: f.year_label, hasData: f.balance_count > 0 })),
    activeFinancialYearId: activeFyId,
    activeFinancialYearLabel: activeFy.year_label,
    units: units.map((u) => ({ id: u.id, unitName: u.unit_name })),
    fslis,
    availableLedgers: availableLedgers.map((l) => ({
      id: l.id,
      ledgerName: l.ledger_name,
      unitId: l.unit_id,
      tallyGroupName: l.tally_group_name,
    })),
    summary,
    adjustments,
  };
}

// ── Downstream Financial Integration (Adjusted Trial Balance) ─────────────────

/**
 * Computes the Adjusted Trial Balance:
 *   Base Balance (Phase 7 Final) + Phase 8 Applied Adjustments = Adjusted Balance
 *
 * Strictly preserves separate Debit and Credit totals (no netting).
 */
export function getAdjustedTrialBalance(
  database: Database.Database,
  financialYearId?: string,
  unitId?: string,
): AdjustedTrialBalanceData {
  const fyRows = database.prepare(`
    SELECT id, year_label, (SELECT COUNT(*) FROM LedgerBalance lb WHERE lb.financial_year_id = fy.id) as cnt
    FROM FinancialYear fy
    ORDER BY year_label DESC
  `).all() as Array<{ id: string; year_label: string; cnt: number }>;

  const activeFy = (financialYearId ? fyRows.find((f) => f.id === financialYearId) : null) || fyRows[0];
  const fyId = activeFy ? activeFy.id : '';
  const fyLabel = activeFy ? activeFy.year_label : '';

  let unitName: string | null = null;
  if (unitId && unitId !== 'ALL') {
    const uRow = database.prepare('SELECT unit_name FROM Unit WHERE id = ?').get(unitId) as { unit_name: string } | undefined;
    unitName = uRow ? uRow.unit_name : null;
  }

  // 1. Get all active FSLIs as base rows
  const allFslis = database.prepare(`
    SELECT id, fsli_code, fsli_name, category, sub_category, display_order
    FROM FSLI
    WHERE active = 1
    ORDER BY display_order ASC, fsli_name ASC
  `).all() as Array<{
    id: string;
    fsli_code: string | null;
    fsli_name: string;
    category: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
    sub_category: string | null;
    display_order: number;
  }>;

  // Map to accumulate totals by FSLI ID
  const fsliMap = new Map<string, {
    fsliId: string;
    fsliCode: string | null;
    fsliName: string;
    category: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
    subCategory: string | null;
    displayOrder: number;
    baseDebit: number;
    baseCredit: number;
    adjDebit: number;
    adjCredit: number;
  }>();

  for (const f of allFslis) {
    fsliMap.set(f.id, {
      fsliId: f.id,
      fsliCode: f.fsli_code,
      fsliName: f.fsli_name,
      category: f.category,
      subCategory: f.sub_category,
      displayOrder: f.display_order,
      baseDebit: 0,
      baseCredit: 0,
      adjDebit: 0,
      adjCredit: 0,
    });
  }

  // 2. Aggregate Phase 7 Base Balances per Ledger -> Resolved FSLI
  // Hierarchy:
  // - Phase 7 Applied/AutoApplied regrouping approved_fsli_id
  // - Else Phase 6 final_fsli_id
  // - Else Phase 5 mapped_fsli_id
  let baseQuery = `
    SELECT
      l.id as ledger_id,
      lb.debit as base_debit,
      lb.credit as base_credit,
      COALESCE(
        CASE WHEN rr.status IN ('Applied', 'AutoApplied') THEN rr.approved_fsli_id END,
        lc.final_fsli_id,
        lm.mapped_fsli_id
      ) as resolved_fsli_id
    FROM LedgerBalance lb
    JOIN Ledger l ON lb.ledger_id = l.id
    LEFT JOIN RegroupingResult rr ON l.id = rr.ledger_id AND lb.financial_year_id = rr.financial_year_id
    LEFT JOIN LedgerClassification lc ON l.id = lc.ledger_id AND lb.financial_year_id = lc.financial_year_id
    LEFT JOIN LedgerMapping lm ON l.id = lm.ledger_id AND lb.financial_year_id = lm.financial_year_id
    WHERE lb.financial_year_id = ?
  `;
  const baseParams: unknown[] = [fyId];
  if (unitId && unitId !== 'ALL') {
    baseQuery += ' AND l.unit_id = ?';
    baseParams.push(unitId);
  }

  const ledgerRows = database.prepare(baseQuery).all(...baseParams) as Array<{
    ledger_id: string;
    base_debit: number;
    base_credit: number;
    resolved_fsli_id: string | null;
  }>;

  for (const lr of ledgerRows) {
    const fsliId = lr.resolved_fsli_id;
    if (fsliId && fsliMap.has(fsliId)) {
      const entry = fsliMap.get(fsliId)!;
      entry.baseDebit += Number(lr.base_debit) || 0;
      entry.baseCredit += Number(lr.base_credit) || 0;
    }
  }

  // 3. Aggregate Phase 8 Applied and Reversed Adjustments per FSLI
  // Both Applied adjustments and Reversed adjustments (paired with their reversal entries)
  // are included so that the original and reversing entry cleanly offset to zero.
  let adjQuery = `
    SELECT
      al.fsli_id,
      SUM(al.debit) as adj_debit,
      SUM(al.credit) as adj_credit
    FROM AdjustmentLine al
    JOIN Adjustment a ON al.adjustment_id = a.id
    WHERE a.financial_year_id = ? AND a.status IN ('Applied', 'Reversed')
  `;
  const adjParams: unknown[] = [fyId];
  if (unitId && unitId !== 'ALL') {
    adjQuery += ' AND a.unit_id = ?';
    adjParams.push(unitId);
  }
  adjQuery += ' GROUP BY al.fsli_id';

  const adjRows = database.prepare(adjQuery).all(...adjParams) as Array<{
    fsli_id: string;
    adj_debit: number;
    adj_credit: number;
  }>;

  for (const ar of adjRows) {
    if (fsliMap.has(ar.fsli_id)) {
      const entry = fsliMap.get(ar.fsli_id)!;
      entry.adjDebit += Number(ar.adj_debit) || 0;
      entry.adjCredit += Number(ar.adj_credit) || 0;
    }
  }

  // 4. Construct rows and calculate totals
  let totalBaseDebit = 0;
  let totalBaseCredit = 0;
  let totalAdjDebit = 0;
  let totalAdjCredit = 0;
  let totalAdjustedDebit = 0;
  let totalAdjustedCredit = 0;

  const rows: AdjustedTrialBalanceRow[] = [];
  const categoryMap = new Map<string, {
    category: string;
    baseDebit: number;
    baseCredit: number;
    baseNet: number;
    adjustmentDebit: number;
    adjustmentCredit: number;
    adjustmentNet: number;
    adjustedDebit: number;
    adjustedCredit: number;
    adjustedNet: number;
  }>();

  for (const item of fsliMap.values()) {
    const baseDr = Math.round(item.baseDebit * 100) / 100;
    const baseCr = Math.round(item.baseCredit * 100) / 100;
    const baseNet = Math.round((baseDr - baseCr) * 100) / 100;

    const adjDr = Math.round(item.adjDebit * 100) / 100;
    const adjCr = Math.round(item.adjCredit * 100) / 100;
    const adjNet = Math.round((adjDr - adjCr) * 100) / 100;

    const finalDr = Math.round((baseDr + adjDr) * 100) / 100;
    const finalCr = Math.round((baseCr + adjCr) * 100) / 100;
    const finalNet = Math.round((finalDr - finalCr) * 100) / 100;

    if (baseDr !== 0 || baseCr !== 0 || adjDr !== 0 || adjCr !== 0) {
      rows.push({
        fsliId: item.fsliId,
        fsliCode: item.fsliCode,
        fsliName: item.fsliName,
        category: item.category,
        subCategory: item.subCategory,
        displayOrder: item.displayOrder,
        baseDebit: baseDr,
        baseCredit: baseCr,
        baseNet: baseNet,
        adjustmentDebit: adjDr,
        adjustmentCredit: adjCr,
        adjustmentNet: adjNet,
        adjustedDebit: finalDr,
        adjustedCredit: finalCr,
        adjustedNet: finalNet,
      });

      totalBaseDebit += baseDr;
      totalBaseCredit += baseCr;
      totalAdjDebit += adjDr;
      totalAdjCredit += adjCr;
      totalAdjustedDebit += finalDr;
      totalAdjustedCredit += finalCr;

      // Category summary accumulation
      if (!categoryMap.has(item.category)) {
        categoryMap.set(item.category, {
          category: item.category,
          baseDebit: 0,
          baseCredit: 0,
          baseNet: 0,
          adjustmentDebit: 0,
          adjustmentCredit: 0,
          adjustmentNet: 0,
          adjustedDebit: 0,
          adjustedCredit: 0,
          adjustedNet: 0,
        });
      }
      const cat = categoryMap.get(item.category)!;
      cat.baseDebit += baseDr;
      cat.baseCredit += baseCr;
      cat.baseNet += baseNet;
      cat.adjustmentDebit += adjDr;
      cat.adjustmentCredit += adjCr;
      cat.adjustmentNet += adjNet;
      cat.adjustedDebit += finalDr;
      cat.adjustedCredit += finalCr;
      cat.adjustedNet += finalNet;
    }
  }

  // Sort rows by category order and display order
  const categoryPriority: Record<string, number> = {
    Equity: 1,
    Liability: 2,
    Asset: 3,
    Income: 4,
    Expense: 5,
  };

  rows.sort((a, b) => {
    const cpA = categoryPriority[a.category] || 99;
    const cpB = categoryPriority[b.category] || 99;
    if (cpA !== cpB) return cpA - cpB;
    return a.displayOrder - b.displayOrder;
  });

  return {
    financialYearId: fyId,
    financialYearLabel: fyLabel,
    unitId: unitId && unitId !== 'ALL' ? unitId : null,
    unitName,
    totalBaseDebit: Math.round(totalBaseDebit * 100) / 100,
    totalBaseCredit: Math.round(totalBaseCredit * 100) / 100,
    totalAdjDebit: Math.round(totalAdjDebit * 100) / 100,
    totalAdjCredit: Math.round(totalAdjCredit * 100) / 100,
    totalAdjustedDebit: Math.round(totalAdjustedDebit * 100) / 100,
    totalAdjustedCredit: Math.round(totalAdjustedCredit * 100) / 100,
    rows,
    categoryTotals: Array.from(categoryMap.values()),
  };
}
