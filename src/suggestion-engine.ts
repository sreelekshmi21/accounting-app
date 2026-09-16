/**
 * Deterministic Auto-Suggestion Engine (Phase 5 Step 2)
 *
 * Evaluates Trial Balance ledgers against a hierarchy of deterministic rules,
 * user-defined rules, historical mappings, group hierarchies, keyword dictionaries,
 * string similarity, and balance nature heuristics to generate explainable
 * FSLI mapping suggestions with confidence scores.
 */

import type Database from 'better-sqlite3';
import type {
  MappingSource,
  FSLIRecord,
  MappingRuleRecord,
} from './electron-api';

export interface SuggestionCandidate {
  ledgerId: string;
  ledgerName: string;
  entityId?: string | null;
  clientId?: string | null;
  tallyGroupId: string | null;
  tallyGroupName: string | null;
  parentGroupId: string | null;
  parentGroupName: string | null;
  depth: number;
  debit: number;
  credit: number;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
}

export interface SuggestionResultItem {
  ledgerId: string;
  ledgerName: string;
  tallyGroupName: string | null;
  parentGroupName: string | null;
  netBalance: number;
  balanceNature: 'Debit' | 'Credit' | 'Zero';
  suggestedFSLIId: string;
  suggestedFSLIName: string;
  suggestedFSLICode: string | null;
  category: string;
  confidenceScore: number;
  reason: string;
  mappingSource: MappingSource;
  ruleId?: string;
  ruleName?: string;
}

export interface SuggestionSummary {
  totalLedgers: number;
  suggestedCount: number;
  highConfidenceCount: number; // >= 0.85
  mediumConfidenceCount: number; // 0.70 - 0.84
  lowConfidenceCount: number; // < 0.70
  bySource: Record<string, number>;
}

export interface GenerateSuggestionsResponse {
  financialYearId: string;
  financialYearLabel: string;
  summary: SuggestionSummary;
  suggestions: SuggestionResultItem[];
}

/**
 * Keyword match rule definition
 */
interface KeywordRule {
  keywords: string[];
  exactKeywords?: string[];
  targetFSLICode: string;
  targetFSLIName: string;
  confidence: number;
  reasonTemplate: (kw: string) => string;
  condition?: (candidate: SuggestionCandidate) => boolean;
}

/**
 * Deterministic Group match dictionary
 */
interface GroupRule {
  targetFSLICode: string;
  targetFSLIName: string;
  confidence: number;
  reason: string;
}

/**
 * Standard group rules dictionary (Case-insensitive matching)
 */
const TALLY_GROUP_RULES: Record<string, GroupRule> = {
  // Current Liabilities
  'sundry creditors': {
    targetFSLICode: 'CL_TRADE_PAY',
    targetFSLIName: 'Trade Payables',
    confidence: 0.95,
    reason: "Standard Tally group 'Sundry Creditors' directly maps to Trade Payables",
  },
  'sundry creditors (trade)': {
    targetFSLICode: 'CL_TRADE_PAY',
    targetFSLIName: 'Trade Payables',
    confidence: 0.95,
    reason: "Tally group 'Sundry Creditors (Trade)' maps to Trade Payables",
  },
  'sundry creditors (others)': {
    targetFSLICode: 'CL_OTH_LIAB',
    targetFSLIName: 'Other Current Liabilities',
    confidence: 0.90,
    reason: "Tally group 'Sundry Creditors (Others)' maps to Other Current Liabilities",
  },
  'duties & taxes': {
    targetFSLICode: 'CL_DUTIES_TAX',
    targetFSLIName: 'Duties and Taxes Payable',
    confidence: 0.95,
    reason: "Tally group 'Duties & Taxes' maps to Duties and Taxes Payable",
  },
  'provisions': {
    targetFSLICode: 'CL_ST_PROV',
    targetFSLIName: 'Short-Term Provisions',
    confidence: 0.90,
    reason: "Tally group 'Provisions' maps to Short-Term Provisions",
  },
  'expenses payable': {
    targetFSLICode: 'CL_OTH_LIAB',
    targetFSLIName: 'Other Current Liabilities',
    confidence: 0.92,
    reason: "Tally group 'Expenses Payable' maps to Other Current Liabilities",
  },

  // Borrowings & Loans
  'working capital loans from banks': {
    targetFSLICode: 'CL_ST_BORR',
    targetFSLIName: 'Short-Term Borrowings',
    confidence: 0.95,
    reason: "Tally group 'Working Capital Loans from Banks' maps to Short-Term Borrowings",
  },
  'bank od a/c': {
    targetFSLICode: 'CL_ST_BORR',
    targetFSLIName: 'Short-Term Borrowings',
    confidence: 0.95,
    reason: "Bank Overdraft accounts map to Short-Term Borrowings",
  },
  'secured loans': {
    targetFSLICode: 'NCL_LT_BORR',
    targetFSLIName: 'Long-Term Borrowings',
    confidence: 0.90,
    reason: "Secured Loans map to Long-Term Borrowings",
  },
  'unsecured loans': {
    targetFSLICode: 'NCL_LT_BORR',
    targetFSLIName: 'Long-Term Borrowings',
    confidence: 0.90,
    reason: "Unsecured Loans map to Long-Term Borrowings",
  },

  // Current Assets
  'sundry debtors': {
    targetFSLICode: 'CA_TRADE_REC',
    targetFSLIName: 'Trade Receivables',
    confidence: 0.95,
    reason: "Standard Tally group 'Sundry Debtors' directly maps to Trade Receivables",
  },
  'bank accounts': {
    targetFSLICode: 'CA_CASH_EQUIV',
    targetFSLIName: 'Cash and Cash Equivalents',
    confidence: 0.95,
    reason: "Bank Accounts map to Cash and Cash Equivalents",
  },
  'cash-in-hand': {
    targetFSLICode: 'CA_CASH_EQUIV',
    targetFSLIName: 'Cash and Cash Equivalents',
    confidence: 0.95,
    reason: "Cash-in-hand maps to Cash and Cash Equivalents",
  },
  'deposits (asset)': {
    targetFSLICode: 'CA_OTH_ASSET',
    targetFSLIName: 'Other Current Assets',
    confidence: 0.90,
    reason: "Security / Earnest Deposits map to Other Current Assets",
  },
  'loans & advances (asset)': {
    targetFSLICode: 'CA_ST_LOAN',
    targetFSLIName: 'Short-Term Loans and Advances',
    confidence: 0.90,
    reason: "Loans and Advances (Asset) map to Short-Term Loans and Advances",
  },
  'advances': {
    targetFSLICode: 'CA_ST_LOAN',
    targetFSLIName: 'Short-Term Loans and Advances',
    confidence: 0.88,
    reason: "Advances group maps to Short-Term Loans and Advances",
  },
  'stock-in-hand': {
    targetFSLICode: 'CA_INVENT',
    targetFSLIName: 'Inventories',
    confidence: 0.95,
    reason: "Stock-in-hand maps to Inventories",
  },

  // Fixed Assets & Investments
  'fixed assets': {
    targetFSLICode: 'NCA_PPE',
    targetFSLIName: 'Property, Plant and Equipment',
    confidence: 0.95,
    reason: "Fixed Assets group maps to Property, Plant and Equipment",
  },
  'investments': {
    targetFSLICode: 'NCA_NC_INV',
    targetFSLIName: 'Non-Current Investments',
    confidence: 0.90,
    reason: "Investments group maps to Non-Current Investments",
  },

  // Equity & Capital
  'capital account': {
    targetFSLICode: 'EQ_CAP_FUND',
    targetFSLIName: 'Capital / Corpus Fund',
    confidence: 0.92,
    reason: "Capital Account group maps to Capital / Corpus Fund",
  },
  'reserves & surplus': {
    targetFSLICode: 'EQ_RES_SURP',
    targetFSLIName: 'Reserves and Surplus',
    confidence: 0.95,
    reason: "Reserves & Surplus group maps to Reserves and Surplus",
  },
  'surplus/deficit previous year': {
    targetFSLICode: 'EQ_RES_SURP',
    targetFSLIName: 'Reserves and Surplus',
    confidence: 0.92,
    reason: "Prior Year Surplus/Deficit Reserve maps to Reserves and Surplus",
  },

  // Revenue & Purchases
  'sales accounts': {
    targetFSLICode: 'INC_REV_OPS',
    targetFSLIName: 'Revenue from Operations',
    confidence: 0.95,
    reason: "Sales Accounts group maps to Revenue from Operations",
  },
  'purchase accounts': {
    targetFSLICode: 'EXP_PUR_STOCK',
    targetFSLIName: 'Purchases of Stock-in-Trade',
    confidence: 0.90,
    reason: "Purchase Accounts group maps to Purchases of Stock-in-Trade",
  },
  'purchase accounts (manufacturing unit)': {
    targetFSLICode: 'EXP_MAT_CONS',
    targetFSLIName: 'Cost of Materials Consumed',
    confidence: 0.92,
    reason: "Manufacturing Purchase Accounts map to Cost of Materials Consumed",
  },
  'direct income': {
    targetFSLICode: 'INC_REV_OPS',
    targetFSLIName: 'Revenue from Operations',
    confidence: 0.95,
    reason: "Direct Income maps to Revenue from Operations",
  },
  'indirect income': {
    targetFSLICode: 'INC_OTH_INC',
    targetFSLIName: 'Other Income',
    confidence: 0.90,
    reason: "Indirect Income maps to Other Income",
  },
  'direct expenses': {
    targetFSLICode: 'EXP_MAT_CONS',
    targetFSLIName: 'Cost of Materials Consumed',
    confidence: 0.85,
    reason: "Direct Expenses map to Cost of Materials Consumed / Direct Operating Costs",
  },
  'indirect expenses': {
    targetFSLICode: 'EXP_OTH_EXP',
    targetFSLIName: 'Other Expenses',
    confidence: 0.85,
    reason: "Indirect Expenses map to Other Expenses",
  },
};

/**
 * Keyword-based rules for high precision matching
 */
const KEYWORD_RULES: KeywordRule[] = [
  // Employee Benefit Expense
  {
    keywords: [
      'salaries & allowances',
      'salary & allowances',
      'salaries and allowances',
      'salaries',
      'salary',
      'wages',
      'remuneration',
      'bonus',
      'provident fund',
      'pf contribution',
      'esi contribution',
      'gratuity',
      'staff welfare',
    ],
    targetFSLICode: 'EXP_EMP_BEN',
    targetFSLIName: 'Employee Benefit Expense',
    confidence: 0.95,
    reasonTemplate: (kw) => `Matched employee compensation keyword '${kw}' → Employee Benefit Expense`,
    condition: (c) => {
      const name = c.ledgerName.toLowerCase();
      // If it's a payable/liability, let liability/provision rules handle it
      if (name.includes('payable') || name.includes('provision') || name.includes('accrued')) {
        return false;
      }
      if (name.includes('auditor')) {
        return false;
      }
      return true;
    },
  },

  // Finance Costs
  {
    keywords: [
      'interest on loan',
      'interest paid',
      'interest expense',
      'finance charges',
      'bank charges',
      'processing fee',
      'bank commission',
    ],
    exactKeywords: ['interest'],
    targetFSLICode: 'EXP_FIN_COST',
    targetFSLIName: 'Finance Costs',
    confidence: 0.92,
    reasonTemplate: (kw) => `Matched finance/interest keyword '${kw}' → Finance Costs`,
    condition: (c) => {
      const name = c.ledgerName.toLowerCase();
      if (name.includes('received') || name.includes('income')) return false;
      if (name.includes('accrued') || name.includes('payable')) return false;
      return c.balanceNature === 'Debit' || (c.tallyGroupName || '').toLowerCase().includes('expense');
    },
  },

  // Interest Received / Other Income
  {
    keywords: [
      'interest received',
      'interest income',
      'dividend received',
      'discount received',
      'miscellaneous income',
      'scrap sales',
      'profit on sale',
    ],
    targetFSLICode: 'INC_OTH_INC',
    targetFSLIName: 'Other Income',
    confidence: 0.92,
    reasonTemplate: (kw) => `Matched other income keyword '${kw}' → Other Income`,
  },

  // Grants and Donations
  {
    keywords: [
      'donation received',
      'anonymous donation',
      'grant received',
      'donation for specific',
      'annadanam',
      'pushpanjali',
      'kanikka',
    ],
    targetFSLICode: 'INC_DON_GRANT',
    targetFSLIName: 'Grants and Donations',
    confidence: 0.92,
    reasonTemplate: (kw) => `Matched philanthropic/grant keyword '${kw}' → Grants and Donations`,
  },

  // Borrowings
  {
    keywords: [
      'term loan',
      'term loans',
      'bank loan',
      'car loan',
      'housing loan',
      'vehicle loan',
      'working capital loan',
      'unsecured loan',
      'cash credit',
      'overdraft',
    ],
    targetFSLICode: 'CL_ST_BORR',
    targetFSLIName: 'Short-Term Borrowings',
    confidence: 0.92,
    reasonTemplate: (kw) => `Matched borrowing keyword '${kw}' → Borrowings`,
  },

  // Cash and Cash Equivalents
  {
    keywords: [
      'bank accounts',
      'bank account',
      'cash-in-hand',
      'petty cash',
      'cash in hand',
      'cash balance',
      'cheque in hand',
      'cheques in hand',
      'bank a/c',
      'sbi bank',
      'hdfc bank',
      'icici bank',
      'axis bank',
      'canara bank',
      'federal bank',
    ],
    targetFSLICode: 'CA_CASH_EQUIV',
    targetFSLIName: 'Cash and Cash Equivalents',
    confidence: 0.95,
    reasonTemplate: (kw) => `Matched cash/bank keyword '${kw}' → Cash and Cash Equivalents`,
  },

  // Trade Receivables
  {
    keywords: [
      'sundry debtors',
      'trade debtors',
      'accounts receivable',
      'customer balance',
    ],
    targetFSLICode: 'CA_TRADE_REC',
    targetFSLIName: 'Trade Receivables',
    confidence: 0.95,
    reasonTemplate: (kw) => `Matched customer/debtor keyword '${kw}' → Trade Receivables`,
  },

  // Trade Payables
  {
    keywords: [
      'sundry creditors',
      'trade creditors',
      'accounts payable',
      'vendor balance',
      'supplier balance',
    ],
    targetFSLICode: 'CL_TRADE_PAY',
    targetFSLIName: 'Trade Payables',
    confidence: 0.95,
    reasonTemplate: (kw) => `Matched supplier/creditor keyword '${kw}' → Trade Payables`,
  },

  // Depreciation
  {
    keywords: [
      'depreciation',
      'amortization',
      'amortisation',
    ],
    targetFSLICode: 'EXP_DEP_AMORT',
    targetFSLIName: 'Depreciation and Amortization Expense',
    confidence: 0.95,
    reasonTemplate: (kw) => `Matched depreciation keyword '${kw}' → Depreciation and Amortization`,
  },

  // Taxes & Duties
  {
    keywords: [
      'gst payable',
      'tds payable',
      'tcs payable',
      'statutory provisions',
      'duties & taxes',
      'gst reclaimable',
      'tds refundable',
      'reclaimable taxes',
    ],
    targetFSLICode: 'CL_DUTIES_TAX',
    targetFSLIName: 'Duties and Taxes Payable',
    confidence: 0.90,
    reasonTemplate: (kw) => `Matched statutory/tax keyword '${kw}'`,
    condition: (c) => {
      // If debit balance and asset in name, map to asset instead
      if (c.balanceNature === 'Debit') {
        return false;
      }
      return true;
    },
  },

  // Tax Assets
  {
    keywords: [
      'tds refundable',
      'gst reclaimable',
      'reclaimable taxes',
      'advance tax',
      'it refund',
    ],
    targetFSLICode: 'CA_OTH_ASSET',
    targetFSLIName: 'Other Current Assets',
    confidence: 0.90,
    reasonTemplate: (kw) => `Matched tax asset keyword '${kw}' → Other Current Assets`,
  },

  // Administrative / Other Expenses
  {
    keywords: [
      'rent',
      'electricity',
      'water charges',
      'telephone',
      'internet',
      'postage',
      'courier',
      'printing',
      'stationery',
      'repairs',
      'maintenance',
      'travelling',
      'conveyance',
      'vehicle running',
      'audit fee',
      'legal fee',
      'professional charges',
      'security charges',
      'insurance',
      'welfare',
      'medical expenses',
    ],
    targetFSLICode: 'EXP_OTH_EXP',
    targetFSLIName: 'Other Expenses',
    confidence: 0.88,
    reasonTemplate: (kw) => `Matched operating/admin expense keyword '${kw}' → Other Expenses`,
  },

  // Fixed Assets / PPE
  {
    keywords: [
      'land',
      'building',
      'plant and machinery',
      'furniture',
      'fixtures',
      'vehicles',
      'computers',
      'office equipment',
      'electrical installation',
      'livestock',
    ],
    targetFSLICode: 'NCA_PPE',
    targetFSLIName: 'Property, Plant and Equipment',
    confidence: 0.88,
    reasonTemplate: (kw) => `Matched capital asset keyword '${kw}' → Property, Plant and Equipment`,
    condition: (c) => c.balanceNature === 'Debit' || c.tallyGroupName?.toLowerCase().includes('asset') || false,
  },
];

/**
 * Calculates token-based string similarity between two phrases (0.0 to 1.0)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const tokens1 = new Set(clean(str1));
  const tokens2 = new Set(clean(str2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Evaluate user custom rules from MappingRule table
 */
function evaluateUserRules(
  candidate: SuggestionCandidate,
  rules: MappingRuleRecord[],
  fsliMap: Map<string, FSLIRecord>
): SuggestionResultItem | null {
  for (const rule of rules) {
    if (!rule.active) continue;

    // Scope check: Entity > Client > Global
    if (rule.scope === 'Entity' && rule.scopeEntityId && candidate.entityId) {
      if (candidate.entityId !== rule.scopeEntityId) continue;
    }
    if (rule.scope === 'Client' && rule.scopeClientId && candidate.clientId) {
      if (candidate.clientId !== rule.scopeClientId) continue;
    }

    const conditions = rule.conditions as {
      type?: string;
      rules?: Array<{ field: string; operator: string; value: string }>;
    };

    if (!conditions || !Array.isArray(conditions.rules) || conditions.rules.length === 0) {
      continue;
    }

    let allMatch = true;
    for (const cond of conditions.rules) {
      const field = cond.field.toLowerCase();
      const op = cond.operator.toLowerCase();
      const val = (cond.value || '').toLowerCase();

      let targetVal = '';
      if (field === 'tally_group' || field === 'tallygroup') {
        targetVal = (candidate.tallyGroupName || '').toLowerCase();
      } else if (field === 'parent_group' || field === 'parentgroup') {
        targetVal = (candidate.parentGroupName || '').toLowerCase();
      } else if (field === 'ledger_name' || field === 'ledgername') {
        targetVal = candidate.ledgerName.toLowerCase();
      } else if (field === 'balance_nature') {
        targetVal = candidate.balanceNature.toLowerCase();
      }

      let matches = false;
      if (op === 'equals') {
        matches = targetVal === val;
      } else if (op === 'contains') {
        matches = targetVal.includes(val);
      } else if (op === 'starts_with') {
        matches = targetVal.startsWith(val);
      } else if (op === 'ends_with') {
        matches = targetVal.endsWith(val);
      } else if (op === 'matches_regex') {
        try {
          matches = new RegExp(val, 'i').test(targetVal);
        } catch {
          matches = false;
        }
      }

      if (!matches) {
        allMatch = false;
        break;
      }
    }

    if (allMatch && rule.targetFSLIId) {
      const fsli = fsliMap.get(rule.targetFSLIId);
      if (fsli) {
        return {
          ledgerId: candidate.ledgerId,
          ledgerName: candidate.ledgerName,
          tallyGroupName: candidate.tallyGroupName,
          parentGroupName: candidate.parentGroupName,
          netBalance: candidate.netBalance,
          balanceNature: candidate.balanceNature,
          suggestedFSLIId: fsli.id,
          suggestedFSLIName: fsli.fsliName,
          suggestedFSLICode: fsli.fsliCode,
          category: fsli.category,
          confidenceScore: rule.confidence,
          reason: `Matched User Rule: "${rule.ruleName}" (Priority: ${rule.priority})`,
          mappingSource: 'UserRule',
          ruleId: rule.id,
          ruleName: rule.ruleName,
        };
      }
    }
  }

  return null;
}

/**
 * Evaluate historical approved mappings from prior financial years
 */
function evaluateHistoricalMappings(
  candidate: SuggestionCandidate,
  currentFinancialYearId: string,
  db: Database.Database,
  fsliMap: Map<string, FSLIRecord>
): SuggestionResultItem | null {
  try {
    const historical = db.prepare(`
      SELECT lm.mapped_fsli_id, fy.year_label
      FROM LedgerMapping lm
      JOIN Ledger l ON lm.ledger_id = l.id
      JOIN FinancialYear fy ON lm.financial_year_id = fy.id
      WHERE LOWER(l.ledger_name) = LOWER(?)
        AND lm.financial_year_id != ?
        AND lm.status IN ('Mapped', 'Suggested')
        AND lm.mapped_fsli_id IS NOT NULL
      ORDER BY lm.updated_at DESC
      LIMIT 1
    `).get(candidate.ledgerName, currentFinancialYearId) as
      | { mapped_fsli_id: string; year_label: string }
      | undefined;

    if (historical && historical.mapped_fsli_id) {
      const fsli = fsliMap.get(historical.mapped_fsli_id);
      if (fsli) {
        return {
          ledgerId: candidate.ledgerId,
          ledgerName: candidate.ledgerName,
          tallyGroupName: candidate.tallyGroupName,
          parentGroupName: candidate.parentGroupName,
          netBalance: candidate.netBalance,
          balanceNature: candidate.balanceNature,
          suggestedFSLIId: fsli.id,
          suggestedFSLIName: fsli.fsliName,
          suggestedFSLICode: fsli.fsliCode,
          category: fsli.category,
          confidenceScore: 0.95,
          reason: `Identical ledger mapped to '${fsli.fsliName}' in previous FY (${historical.year_label})`,
          mappingSource: 'HistoricalMapping',
        };
      }
    }
  } catch {
    // Ignore query error if tables empty
  }
  return null;
}

/**
 * Generate suggestions for all ledgers of a given financial year
 */
export function generateSuggestionsForFinancialYear(
  db: Database.Database,
  financialYearId: string,
  options?: { unitId?: string; importBatchId?: string }
): GenerateSuggestionsResponse {
  // 1. Fetch FY Info
  const fyRow = db.prepare('SELECT id, year_label FROM FinancialYear WHERE id = ?').get(financialYearId) as
    | { id: string; year_label: string }
    | undefined;

  if (!fyRow) {
    throw new Error(`Financial Year with ID '${financialYearId}' not found.`);
  }

  // 2. Fetch Active FSLIs
  const fslis = getFSLIs().filter((f) => f.active);

  // 3. Fetch Active User Mapping Rules (highest priority first)
  const userRulesRaw = db
    .prepare(
      'SELECT id, rule_name, priority, conditions, action, target_fsli_id, confidence, scope FROM MappingRule WHERE active = 1 ORDER BY priority DESC'
    )
    .all() as Array<{
    id: string;
    rule_name: string;
    priority: number;
    conditions: string;
    action: string;
    target_fsli_id: string;
    confidence: number;
    scope: string;
  }>;

  const userRules: MappingRuleRecord[] = userRulesRaw.map((r) => ({
    id: r.id,
    ruleName: r.rule_name,
    priority: r.priority,
    conditions: JSON.parse(r.conditions),
    action: r.action as 'map_to_fsli',
    targetFSLIId: r.target_fsli_id,
    confidence: r.confidence,
    scope: r.scope as 'Global' | 'Client' | 'Entity',
    active: true,
    createdBy: 'system',
    createdAt: r.conditions,
    updatedAt: r.conditions,
  }));

  // 4. Fetch candidate ledgers with balances & group hierarchy (strictly filtered by unit / batch if requested)
  let candidateSql = `
    SELECT
      l.id as ledger_id,
      l.ledger_name,
      l.entity_id,
      l.unit_id,
      l.source_import_id,
      e.client_id,
      tg.id as tally_group_id,
      tg.group_name as tally_group_name,
      pg.id as parent_group_id,
      pg.group_name as parent_group_name,
      lb.debit,
      lb.credit,
      lb.net_balance
    FROM Ledger l
    JOIN Entity e ON l.entity_id = e.id
    LEFT JOIN TallyGroup tg ON l.tally_group_id = tg.id
    LEFT JOIN TallyGroup pg ON tg.parent_group_id = pg.id
    LEFT JOIN LedgerBalance lb ON l.id = lb.ledger_id AND lb.financial_year_id = ?
  `;
  const candidateParams: any[] = [financialYearId];
  const whereClauses: string[] = [];

  if (options?.unitId && options.unitId !== 'ALL') {
    whereClauses.push('l.unit_id = ?');
    candidateParams.push(options.unitId);
  }

  if (options?.importBatchId && options.importBatchId !== 'ALL') {
    whereClauses.push('l.source_import_id = ?');
    candidateParams.push(options.importBatchId);
  }

  if (whereClauses.length > 0) {
    candidateSql += ' WHERE ' + whereClauses.join(' AND ');
  }

  candidateSql += ' ORDER BY tg.group_name, l.ledger_name';

  const candidatesRaw = db.prepare(candidateSql).all(...candidateParams) as Array<{
    ledger_id: string;
    ledger_name: string;
    entity_id: string | null;
    unit_id: string | null;
    source_import_id: string | null;
    client_id: string | null;
    tally_group_id: string | null;
    tally_group_name: string | null;
    parent_group_id: string | null;
    parent_group_name: string | null;
    debit: number | null;
    credit: number | null;
    net_balance: number | null;
  }>;

  const candidates: SuggestionCandidate[] = candidatesRaw.map((c) => {
    const debit = c.debit || 0;
    const credit = c.credit || 0;
    const net = c.net_balance !== null ? c.net_balance : debit - credit;
    const nature: 'Debit' | 'Credit' | 'Zero' = net > 0 ? 'Debit' : net < 0 ? 'Credit' : 'Zero';

    return {
      ledgerId: c.ledger_id,
      ledgerName: c.ledger_name,
      entityId: c.entity_id,
      clientId: c.client_id,
      tallyGroupId: c.tally_group_id,
      tallyGroupName: c.tally_group_name,
      parentGroupId: c.parent_group_id,
      parentGroupName: c.parent_group_name,
      depth: c.depth || 0,
      debit,
      credit,
      netBalance: net,
      balanceNature: nature,
    };
  });

  const suggestions: SuggestionResultItem[] = [];

  // 5. Evaluate each candidate through the deterministic pipeline
  for (const candidate of candidates) {
    const lNameLower = candidate.ledgerName.toLowerCase();
    const groupLower = (candidate.tallyGroupName || '').toLowerCase().trim();
    const parentLower = (candidate.parentGroupName || '').toLowerCase().trim();

    // ─────────────────────────────────────────────────────────────
    // Tier 1: User-Defined Rules
    // ─────────────────────────────────────────────────────────────
    const userRuleSuggestion = evaluateUserRules(candidate, userRules, fsliMap);
    if (userRuleSuggestion) {
      suggestions.push(userRuleSuggestion);
      continue;
    }

    // ─────────────────────────────────────────────────────────────
    // Tier 2: Historical Mappings (Prior Financial Years)
    // ─────────────────────────────────────────────────────────────
    const histSuggestion = evaluateHistoricalMappings(candidate, financialYearId, db, fsliMap);
    if (histSuggestion) {
      suggestions.push(histSuggestion);
      continue;
    }

    // ─────────────────────────────────────────────────────────────
    // Tier 3: Exact Tally Group Matching
    // ─────────────────────────────────────────────────────────────
    let groupMatched = false;
    if (groupLower && TALLY_GROUP_RULES[groupLower]) {
      const gRule = TALLY_GROUP_RULES[groupLower];
      const targetFSLI = findFSLI(gRule.targetFSLICode, gRule.targetFSLIName);
      if (targetFSLI) {
        suggestions.push({
          ledgerId: candidate.ledgerId,
          ledgerName: candidate.ledgerName,
          tallyGroupName: candidate.tallyGroupName,
          parentGroupName: candidate.parentGroupName,
          netBalance: candidate.netBalance,
          balanceNature: candidate.balanceNature,
          suggestedFSLIId: targetFSLI.id,
          suggestedFSLIName: targetFSLI.fsliName,
          suggestedFSLICode: targetFSLI.fsliCode,
          category: targetFSLI.category,
          confidenceScore: gRule.confidence,
          reason: gRule.reason,
          mappingSource: 'SystemSuggestion',
        });
        groupMatched = true;
      }
    }

    if (groupMatched) continue;

    // ─────────────────────────────────────────────────────────────
    // Tier 4: High-Precision Keyword Matching on Ledger Name
    // ─────────────────────────────────────────────────────────────
    let kwMatched = false;
    for (const kwRule of KEYWORD_RULES) {
      if (kwRule.condition && !kwRule.condition(candidate)) {
        continue;
      }

      let matchedWord: string | null = null;

      // Check exact words if configured
      if (kwRule.exactKeywords) {
        for (const ekw of kwRule.exactKeywords) {
          const regex = new RegExp(`\\b${ekw}\\b`, 'i');
          if (regex.test(lNameLower)) {
            matchedWord = ekw;
            break;
          }
        }
      }

      // Check standard keywords (substring or word boundary)
      if (!matchedWord) {
        for (const kw of kwRule.keywords) {
          if (lNameLower.includes(kw.toLowerCase())) {
            matchedWord = kw;
            break;
          }
        }
      }

      if (matchedWord) {
        const targetFSLI = findFSLI(kwRule.targetFSLICode, kwRule.targetFSLIName);
        if (targetFSLI) {
          suggestions.push({
            ledgerId: candidate.ledgerId,
            ledgerName: candidate.ledgerName,
            tallyGroupName: candidate.tallyGroupName,
            parentGroupName: candidate.parentGroupName,
            netBalance: candidate.netBalance,
            balanceNature: candidate.balanceNature,
            suggestedFSLIId: targetFSLI.id,
            suggestedFSLIName: targetFSLI.fsliName,
            suggestedFSLICode: targetFSLI.fsliCode,
            category: targetFSLI.category,
            confidenceScore: kwRule.confidence,
            reason: kwRule.reasonTemplate(matchedWord),
            mappingSource: 'SystemSuggestion',
          });
          kwMatched = true;
          break;
        }
      }
    }

    if (kwMatched) continue;

    // ─────────────────────────────────────────────────────────────
    // Tier 5: Parent Group Fallback
    // ─────────────────────────────────────────────────────────────
    let parentMatched = false;
    if (parentLower && TALLY_GROUP_RULES[parentLower]) {
      const pRule = TALLY_GROUP_RULES[parentLower];
      const targetFSLI = findFSLI(pRule.targetFSLICode, pRule.targetFSLIName);
      if (targetFSLI) {
        suggestions.push({
          ledgerId: candidate.ledgerId,
          ledgerName: candidate.ledgerName,
          tallyGroupName: candidate.tallyGroupName,
          parentGroupName: candidate.parentGroupName,
          netBalance: candidate.netBalance,
          balanceNature: candidate.balanceNature,
          suggestedFSLIId: targetFSLI.id,
          suggestedFSLIName: targetFSLI.fsliName,
          suggestedFSLICode: targetFSLI.fsliCode,
          category: targetFSLI.category,
          confidenceScore: Math.max(0.75, pRule.confidence - 0.08),
          reason: `Parent Tally group '${candidate.parentGroupName}' maps to ${targetFSLI.fsliName}`,
          mappingSource: 'SystemSuggestion',
        });
        parentMatched = true;
      }
    }

    if (parentMatched) continue;

    // ─────────────────────────────────────────────────────────────
    // Tier 6: String Similarity with Standard FSLIs
    // ─────────────────────────────────────────────────────────────
    let bestSimilarity = 0;
    let bestFSLI: FSLIRecord | null = null;

    for (const fsli of fsliRows) {
      const sim = calculateSimilarity(candidate.ledgerName, fsli.fsli_name);
      if (sim > bestSimilarity && sim >= 0.4) {
        bestSimilarity = sim;
        const rec = fsliMap.get(fsli.id);
        if (rec) bestFSLI = rec;
      }
    }

    if (bestFSLI && bestSimilarity >= 0.5) {
      suggestions.push({
        ledgerId: candidate.ledgerId,
        ledgerName: candidate.ledgerName,
        tallyGroupName: candidate.tallyGroupName,
        parentGroupName: candidate.parentGroupName,
        netBalance: candidate.netBalance,
        balanceNature: candidate.balanceNature,
        suggestedFSLIId: bestFSLI.id,
        suggestedFSLIName: bestFSLI.fsliName,
        suggestedFSLICode: bestFSLI.fsliCode,
        category: bestFSLI.category,
        confidenceScore: Math.min(0.85, Number((0.65 + bestSimilarity * 0.25).toFixed(2))),
        reason: `Lexical name similarity (${Math.round(bestSimilarity * 100)}%) with '${bestFSLI.fsliName}'`,
        mappingSource: 'SystemSuggestion',
      });
      continue;
    }

    // ─────────────────────────────────────────────────────────────
    // Tier 7: Balance Nature & Broad Group Fallback Heuristics
    // ─────────────────────────────────────────────────────────────
    let fallbackCode = 'EXP_OTH_EXP';
    let fallbackName = 'Other Expenses';
    let fallbackConfidence = 0.65;
    let fallbackReason = 'Classified based on default expense categorization';

    if (groupLower.includes('income') || candidate.balanceNature === 'Credit') {
      if (groupLower.includes('sales') || groupLower.includes('turnover')) {
        fallbackCode = 'INC_REV_OPS';
        fallbackName = 'Revenue from Operations';
        fallbackConfidence = 0.80;
        fallbackReason = 'Credit balance under revenue/sales group';
      } else if (groupLower.includes('capital') || groupLower.includes('fund') || groupLower.includes('reserve')) {
        fallbackCode = 'EQ_RES_SURP';
        fallbackName = 'Reserves and Surplus';
        fallbackConfidence = 0.75;
        fallbackReason = 'Credit balance under Capital/Reserve category';
      } else if (groupLower.includes('liability') || groupLower.includes('payable') || groupLower.includes('creditor')) {
        fallbackCode = 'CL_OTH_LIAB';
        fallbackName = 'Other Current Liabilities';
        fallbackConfidence = 0.75;
        fallbackReason = 'Credit balance under liabilities group';
      } else {
        fallbackCode = 'INC_OTH_INC';
        fallbackName = 'Other Income';
        fallbackConfidence = 0.70;
        fallbackReason = 'Credit balance categorized as Other Income';
      }
    } else {
      // Debit balance
      if (groupLower.includes('asset') || groupLower.includes('advance') || groupLower.includes('deposit')) {
        fallbackCode = 'CA_OTH_ASSET';
        fallbackName = 'Other Current Assets';
        fallbackConfidence = 0.75;
        fallbackReason = 'Debit balance under asset group categorized as Other Current Assets';
      } else if (groupLower.includes('expense') || groupLower.includes('purchase') || groupLower.includes('cost')) {
        fallbackCode = 'EXP_OTH_EXP';
        fallbackName = 'Other Expenses';
        fallbackConfidence = 0.75;
        fallbackReason = 'Debit balance categorized as Other Operating/General Expenses';
      }
    }

    const fallbackFSLI = findFSLI(fallbackCode, fallbackName);
    if (fallbackFSLI) {
      suggestions.push({
        ledgerId: candidate.ledgerId,
        ledgerName: candidate.ledgerName,
        tallyGroupName: candidate.tallyGroupName,
        parentGroupName: candidate.parentGroupName,
        netBalance: candidate.netBalance,
        balanceNature: candidate.balanceNature,
        suggestedFSLIId: fallbackFSLI.id,
        suggestedFSLIName: fallbackFSLI.fsliName,
        suggestedFSLICode: fallbackFSLI.fsliCode,
        category: fallbackFSLI.category,
        confidenceScore: fallbackConfidence,
        reason: fallbackReason,
        mappingSource: 'SystemSuggestion',
      });
    }
  }

  // 6. Calculate Summary Metrics
  const bySource: Record<string, number> = {};
  let highConf = 0;
  let medConf = 0;
  let lowConf = 0;

  for (const s of suggestions) {
    bySource[s.mappingSource] = (bySource[s.mappingSource] || 0) + 1;
    if (s.confidenceScore >= 0.85) highConf++;
    else if (s.confidenceScore >= 0.70) medConf++;
    else lowConf++;
  }

  return {
    financialYearId,
    financialYearLabel: fyLabel,
    summary: {
      totalLedgers: candidates.length,
      suggestedCount: suggestions.length,
      highConfidenceCount: highConf,
      mediumConfidenceCount: medConf,
      lowConfidenceCount: lowConf,
      bySource,
    },
    suggestions,
  };
}