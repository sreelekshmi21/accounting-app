/**
 * Standard FSLI Catalog (Schedule III / Accounting Standards compliant)
 */

export interface StandardFSLIDefinition {
  code: string;
  name: string;
  category: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  subCategory: string;
  displayOrder: number;
}

export const STANDARD_FSLI_CATALOG: StandardFSLIDefinition[] = [
  // ── Equity & Liabilities ──────────────────────────────────────────
  {
    code: 'EQ_CAP_FUND',
    name: 'Capital / Corpus Fund',
    category: 'Equity',
    subCategory: 'Shareholders Funds / Corpus',
    displayOrder: 10,
  },
  {
    code: 'EQ_RES_SURP',
    name: 'Reserves and Surplus',
    category: 'Equity',
    subCategory: 'Shareholders Funds / Corpus',
    displayOrder: 20,
  },
  {
    code: 'NCL_LT_BORR',
    name: 'Long-Term Borrowings',
    category: 'Liability',
    subCategory: 'Non-Current Liabilities',
    displayOrder: 30,
  },
  {
    code: 'NCL_DEF_TAX',
    name: 'Deferred Tax Liabilities (Net)',
    category: 'Liability',
    subCategory: 'Non-Current Liabilities',
    displayOrder: 40,
  },
  {
    code: 'NCL_OTH_LIAB',
    name: 'Other Non-Current Liabilities',
    category: 'Liability',
    subCategory: 'Non-Current Liabilities',
    displayOrder: 50,
  },
  {
    code: 'NCL_LT_PROV',
    name: 'Long-Term Provisions',
    category: 'Liability',
    subCategory: 'Non-Current Liabilities',
    displayOrder: 60,
  },
  {
    code: 'CL_ST_BORR',
    name: 'Short-Term Borrowings',
    category: 'Liability',
    subCategory: 'Current Liabilities',
    displayOrder: 70,
  },
  {
    code: 'CL_TRADE_PAY',
    name: 'Trade Payables',
    category: 'Liability',
    subCategory: 'Current Liabilities',
    displayOrder: 80,
  },
  {
    code: 'CL_OTH_LIAB',
    name: 'Other Current Liabilities',
    category: 'Liability',
    subCategory: 'Current Liabilities',
    displayOrder: 90,
  },
  {
    code: 'CL_ST_PROV',
    name: 'Short-Term Provisions',
    category: 'Liability',
    subCategory: 'Current Liabilities',
    displayOrder: 100,
  },
  {
    code: 'CL_DUTIES_TAX',
    name: 'Duties and Taxes Payable',
    category: 'Liability',
    subCategory: 'Current Liabilities',
    displayOrder: 110,
  },

  // ── Assets ────────────────────────────────────────────────────────
  {
    code: 'NCA_PPE',
    name: 'Property, Plant and Equipment',
    category: 'Asset',
    subCategory: 'Property, Plant and Equipment',
    displayOrder: 200,
  },
  {
    code: 'NCA_CWIP',
    name: 'Capital Work-in-Progress',
    category: 'Asset',
    subCategory: 'Property, Plant and Equipment',
    displayOrder: 210,
  },
  {
    code: 'NCA_INTANG',
    name: 'Intangible Assets',
    category: 'Asset',
    subCategory: 'Property, Plant and Equipment',
    displayOrder: 220,
  },
  {
    code: 'NCA_NC_INV',
    name: 'Non-Current Investments',
    category: 'Asset',
    subCategory: 'Non-Current Assets',
    displayOrder: 230,
  },
  {
    code: 'NCA_DEF_TAX',
    name: 'Deferred Tax Assets (Net)',
    category: 'Asset',
    subCategory: 'Non-Current Assets',
    displayOrder: 240,
  },
  {
    code: 'NCA_LT_LOAN',
    name: 'Long-Term Loans and Advances',
    category: 'Asset',
    subCategory: 'Non-Current Assets',
    displayOrder: 250,
  },
  {
    code: 'NCA_OTH_ASSET',
    name: 'Other Non-Current Assets',
    category: 'Asset',
    subCategory: 'Non-Current Assets',
    displayOrder: 260,
  },
  {
    code: 'CA_CURR_INV',
    name: 'Current Investments',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 270,
  },
  {
    code: 'CA_INVENT',
    name: 'Inventories',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 280,
  },
  {
    code: 'CA_TRADE_REC',
    name: 'Trade Receivables',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 290,
  },
  {
    code: 'CA_CASH_EQUIV',
    name: 'Cash and Cash Equivalents',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 300,
  },
  {
    code: 'CA_BANK_BAL',
    name: 'Bank Balances (Other)',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 310,
  },
  {
    code: 'CA_ST_LOAN',
    name: 'Short-Term Loans and Advances',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 320,
  },
  {
    code: 'CA_OTH_ASSET',
    name: 'Other Current Assets',
    category: 'Asset',
    subCategory: 'Current Assets',
    displayOrder: 330,
  },

  // ── Income ────────────────────────────────────────────────────────
  {
    code: 'INC_REV_OPS',
    name: 'Revenue from Operations',
    category: 'Income',
    subCategory: 'Revenue',
    displayOrder: 400,
  },
  {
    code: 'INC_OTH_INC',
    name: 'Other Income',
    category: 'Income',
    subCategory: 'Other Income',
    displayOrder: 410,
  },
  {
    code: 'INC_DON_GRANT',
    name: 'Grants and Donations',
    category: 'Income',
    subCategory: 'Grants and Contributions',
    displayOrder: 420,
  },

  // ── Expenses ──────────────────────────────────────────────────────
  {
    code: 'EXP_MAT_CONS',
    name: 'Cost of Materials Consumed',
    category: 'Expense',
    subCategory: 'Operating Expenses',
    displayOrder: 500,
  },
  {
    code: 'EXP_PUR_STOCK',
    name: 'Purchases of Stock-in-Trade',
    category: 'Expense',
    subCategory: 'Operating Expenses',
    displayOrder: 510,
  },
  {
    code: 'EXP_CHG_INV',
    name: 'Changes in Inventories of Finished Goods, WIP and Stock-in-Trade',
    category: 'Expense',
    subCategory: 'Operating Expenses',
    displayOrder: 520,
  },
  {
    code: 'EXP_EMP_BEN',
    name: 'Employee Benefit Expense',
    category: 'Expense',
    subCategory: 'Employee Benefits',
    displayOrder: 530,
  },
  {
    code: 'EXP_FIN_COST',
    name: 'Finance Costs',
    category: 'Expense',
    subCategory: 'Finance Costs',
    displayOrder: 540,
  },
  {
    code: 'EXP_DEP_AMORT',
    name: 'Depreciation and Amortization Expense',
    category: 'Expense',
    subCategory: 'Depreciation',
    displayOrder: 550,
  },
  {
    code: 'EXP_ADMIN_GEN',
    name: 'Administrative and General Expenses',
    category: 'Expense',
    subCategory: 'Other Expenses',
    displayOrder: 560,
  },
  {
    code: 'EXP_OTH_EXP',
    name: 'Other Expenses',
    category: 'Expense',
    subCategory: 'Other Expenses',
    displayOrder: 570,
  },
];
