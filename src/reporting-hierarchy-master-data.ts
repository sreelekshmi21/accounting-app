/**
 * Authoritative Reporting Hierarchy Master Data
 * Extracted directly from: reference/Format of Balance sheet , IE and schedules1.xlsx
 *
 * Defines:
 * - Reporting Statements (Balance Sheet, Income & Expenditure)
 * - Reporting Schedules (Notes 4 through 33)
 * - Reporting Nodes (Sub-Schedules, Line Items, Movement Nodes, Subtotals)
 * - 1:N FSLI to Reporting Node Default Mappings
 */

export interface ReportingStatementDef {
  id: string;
  statementCode: 'BS' | 'IE';
  statementName: string;
  displayOrder: number;
}

export interface ReportingScheduleDef {
  id: string;
  statementCode: 'BS' | 'IE';
  scheduleNumber: number;
  scheduleCode: string;
  scheduleName: string;
  scheduleType: 'CAPITAL_RESERVE' | 'LIABILITY' | 'ASSET' | 'INCOME' | 'EXPENSE';
  isCalculated: boolean;
  calculatorKey?: string;
  displayOrder: number;
}

export interface ReportingNodeDef {
  id: string;
  scheduleCode: string;
  parentNodeCode?: string;
  nodeCode: string;
  nodeName: string;
  nodeType: 'HEADER' | 'LINE_ITEM' | 'SUB_SCHEDULE' | 'SUBTOTAL' | 'TOTAL' | 'CALCULATED' | 'MOVEMENT';
  balanceNature: 'DEBIT' | 'CREDIT' | 'NET' | 'BOTH';
  movementType?: 'OPENING' | 'ADDITION' | 'DEDUCTION' | 'DISPOSAL' | 'CLOSING' | 'NONE';
  isProtectedAccount?: boolean;
  displayOrder: number;
  depth: number;
  targetStatementLine?: string;
}

export interface FSLIToNodeMappingDef {
  fsliCode: string;
  nodeCode: string;
  mappingCondition?: string;
}

export const REPORTING_STATEMENTS: ReportingStatementDef[] = [
  { id: 'stmt-bs', statementCode: 'BS', statementName: 'Balance Sheet', displayOrder: 1 },
  { id: 'stmt-ie', statementCode: 'IE', statementName: 'Statement of Income and Expenditure', displayOrder: 2 },
];

export const REPORTING_SCHEDULES: ReportingScheduleDef[] = [
  // ── Balance Sheet Schedules (Notes 4 - 19) ──────────────────────────────────
  {
    id: 'sch-04',
    statementCode: 'BS',
    scheduleNumber: 4,
    scheduleCode: 'SCH_04',
    scheduleName: '4. Corpus',
    scheduleType: 'CAPITAL_RESERVE',
    isCalculated: true,
    calculatorKey: 'CorpusCalculator',
    displayOrder: 10,
  },
  {
    id: 'sch-05',
    statementCode: 'BS',
    scheduleNumber: 5,
    scheduleCode: 'SCH_05',
    scheduleName: '5. Reserve and Surplus',
    scheduleType: 'CAPITAL_RESERVE',
    isCalculated: true,
    calculatorKey: 'ReserveAndSurplusCalculator',
    displayOrder: 20,
  },
  {
    id: 'sch-06',
    statementCode: 'BS',
    scheduleNumber: 6,
    scheduleCode: 'SCH_06',
    scheduleName: '6. Secured Loans',
    scheduleType: 'LIABILITY',
    isCalculated: false,
    displayOrder: 30,
  },
  {
    id: 'sch-07',
    statementCode: 'BS',
    scheduleNumber: 7,
    scheduleCode: 'SCH_07',
    scheduleName: '7. Unsecured Loans',
    scheduleType: 'LIABILITY',
    isCalculated: false,
    displayOrder: 40,
  },
  {
    id: 'sch-08',
    statementCode: 'BS',
    scheduleNumber: 8,
    scheduleCode: 'SCH_08',
    scheduleName: '8. Sundry Creditors',
    scheduleType: 'LIABILITY',
    isCalculated: false,
    displayOrder: 50,
  },
  {
    id: 'sch-09',
    statementCode: 'BS',
    scheduleNumber: 9,
    scheduleCode: 'SCH_09',
    scheduleName: '9. Other Current liabilities',
    scheduleType: 'LIABILITY',
    isCalculated: false,
    displayOrder: 60,
  },
  {
    id: 'sch-10',
    statementCode: 'BS',
    scheduleNumber: 10,
    scheduleCode: 'SCH_10',
    scheduleName: '10. Short Term Liabilities and Provisions',
    scheduleType: 'LIABILITY',
    isCalculated: false,
    displayOrder: 70,
  },
  {
    id: 'sch-11',
    statementCode: 'BS',
    scheduleNumber: 11,
    scheduleCode: 'SCH_11',
    scheduleName: '11. Tangible Assets',
    scheduleType: 'ASSET',
    isCalculated: true,
    calculatorKey: 'TangibleAssetsCalculator',
    displayOrder: 80,
  },
  {
    id: 'sch-12',
    statementCode: 'BS',
    scheduleNumber: 12,
    scheduleCode: 'SCH_12',
    scheduleName: '12. Capital Work in Progress',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 90,
  },
  {
    id: 'sch-13',
    statementCode: 'BS',
    scheduleNumber: 13,
    scheduleCode: 'SCH_13',
    scheduleName: '13. Live stock',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 100,
  },
  {
    id: 'sch-14',
    statementCode: 'BS',
    scheduleNumber: 14,
    scheduleCode: 'SCH_14',
    scheduleName: '14. Trade Receivable',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 110,
  },
  {
    id: 'sch-15',
    statementCode: 'BS',
    scheduleNumber: 15,
    scheduleCode: 'SCH_15',
    scheduleName: '15. Cash and bank balances',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 120,
  },
  {
    id: 'sch-16',
    statementCode: 'BS',
    scheduleNumber: 16,
    scheduleCode: 'SCH_16',
    scheduleName: '16. Investments',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 130,
  },
  {
    id: 'sch-17',
    statementCode: 'BS',
    scheduleNumber: 17,
    scheduleCode: 'SCH_17',
    scheduleName: '17. Inventories',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 140,
  },
  {
    id: 'sch-18',
    statementCode: 'BS',
    scheduleNumber: 18,
    scheduleCode: 'SCH_18',
    scheduleName: '18. Short term loans and advances',
    scheduleType: 'ASSET',
    isCalculated: true,
    calculatorKey: 'LoansAndAdvancesCalculator',
    displayOrder: 150,
  },
  {
    id: 'sch-19',
    statementCode: 'BS',
    scheduleNumber: 19,
    scheduleCode: 'SCH_19',
    scheduleName: '19. Other Current Assets',
    scheduleType: 'ASSET',
    isCalculated: false,
    displayOrder: 160,
  },

  // ── Income & Expenditure Schedules (Notes 20 - 33) ───────────────────────────
  {
    id: 'sch-20',
    statementCode: 'IE',
    scheduleNumber: 20,
    scheduleCode: 'SCH_20',
    scheduleName: '20. Donations and Grant in Aid',
    scheduleType: 'INCOME',
    isCalculated: false,
    displayOrder: 200,
  },
  {
    id: 'sch-21',
    statementCode: 'IE',
    scheduleNumber: 21,
    scheduleCode: 'SCH_21',
    scheduleName: '21. Donations for Scientific and Industrial, Social Research',
    scheduleType: 'INCOME',
    isCalculated: false,
    displayOrder: 210,
  },
  {
    id: 'sch-22',
    statementCode: 'IE',
    scheduleNumber: 22,
    scheduleCode: 'SCH_22',
    scheduleName: '22. Revenue from operations',
    scheduleType: 'INCOME',
    isCalculated: false,
    displayOrder: 220,
  },
  {
    id: 'sch-23',
    statementCode: 'IE',
    scheduleNumber: 23,
    scheduleCode: 'SCH_23',
    scheduleName: '23. Agriculture, Dairy Income',
    scheduleType: 'INCOME',
    isCalculated: false,
    displayOrder: 230,
  },
  {
    id: 'sch-24',
    statementCode: 'IE',
    scheduleNumber: 24,
    scheduleCode: 'SCH_24',
    scheduleName: '24. Other income',
    scheduleType: 'INCOME',
    isCalculated: false,
    displayOrder: 240,
  },
  {
    id: 'sch-25',
    statementCode: 'IE',
    scheduleNumber: 25,
    scheduleCode: 'SCH_25',
    scheduleName: '25. Increase ( Decrease) in Finished Goods, Manufacturing Items & WIP',
    scheduleType: 'INCOME',
    isCalculated: true,
    calculatorKey: 'StockMovementCalculator',
    displayOrder: 250,
  },
  {
    id: 'sch-26',
    statementCode: 'IE',
    scheduleNumber: 26,
    scheduleCode: 'SCH_26',
    scheduleName: '26. Community Welfare, Charitable Application',
    scheduleType: 'EXPENSE',
    isCalculated: false,
    displayOrder: 260,
  },
  {
    id: 'sch-27',
    statementCode: 'IE',
    scheduleNumber: 27,
    scheduleCode: 'SCH_27',
    scheduleName: '27. Application for Social & Scientific Research',
    scheduleType: 'EXPENSE',
    isCalculated: false,
    displayOrder: 270,
  },
  {
    id: 'sch-28',
    statementCode: 'IE',
    scheduleNumber: 28,
    scheduleCode: 'SCH_28',
    scheduleName: '28. Consumption of material, stores and others',
    scheduleType: 'EXPENSE',
    isCalculated: true,
    calculatorKey: 'MaterialConsumptionCalculator',
    displayOrder: 280,
  },
  {
    id: 'sch-29',
    statementCode: 'IE',
    scheduleNumber: 29,
    scheduleCode: 'SCH_29',
    scheduleName: '29. Cost of Trading Items sold',
    scheduleType: 'EXPENSE',
    isCalculated: true,
    calculatorKey: 'TradingCOGSCalculator',
    displayOrder: 290,
  },
  {
    id: 'sch-30',
    statementCode: 'IE',
    scheduleNumber: 30,
    scheduleCode: 'SCH_30',
    scheduleName: '30. Agriculture, Dairy Expense',
    scheduleType: 'EXPENSE',
    isCalculated: false,
    displayOrder: 300,
  },
  {
    id: 'sch-31',
    statementCode: 'IE',
    scheduleNumber: 31,
    scheduleCode: 'SCH_31',
    scheduleName: '31. Employee benefits expenses',
    scheduleType: 'EXPENSE',
    isCalculated: false,
    displayOrder: 310,
  },
  {
    id: 'sch-32',
    statementCode: 'IE',
    scheduleNumber: 32,
    scheduleCode: 'SCH_32',
    scheduleName: '32. Finance Cost',
    scheduleType: 'EXPENSE',
    isCalculated: false,
    displayOrder: 320,
  },
  {
    id: 'sch-33',
    statementCode: 'IE',
    scheduleNumber: 33,
    scheduleCode: 'SCH_33',
    scheduleName: '33. Administrative and Other expenses',
    scheduleType: 'EXPENSE',
    isCalculated: false,
    displayOrder: 330,
  },
];

export const REPORTING_NODES: ReportingNodeDef[] = [
  // ── Note 4: Corpus ────────────────────────────────────────────────────────
  {
    id: 'node-04-bf',
    scheduleCode: 'SCH_04',
    nodeCode: 'N_04_BF',
    nodeName: 'Balance b/f',
    nodeType: 'MOVEMENT',
    balanceNature: 'CREDIT',
    movementType: 'OPENING',
    displayOrder: 1,
    depth: 1,
  },
  {
    id: 'node-04-add',
    scheduleCode: 'SCH_04',
    nodeCode: 'N_04_ADD',
    nodeName: 'Add : Received During the year',
    nodeType: 'MOVEMENT',
    balanceNature: 'CREDIT',
    movementType: 'ADDITION',
    displayOrder: 2,
    depth: 1,
  },
  {
    id: 'node-04-tot',
    scheduleCode: 'SCH_04',
    nodeCode: 'N_04_TOT',
    nodeName: 'Total Corpus',
    nodeType: 'TOTAL',
    balanceNature: 'CREDIT',
    displayOrder: 3,
    depth: 0,
  },

  // ── Note 5: Reserve and Surplus (11 Sub-funds a - k) ───────────────────────
  { id: 'node-05-a', scheduleCode: 'SCH_05', nodeCode: 'N_05_A', nodeName: 'a) Investment Subsidy', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 1, depth: 1 },
  { id: 'node-05-b', scheduleCode: 'SCH_05', nodeCode: 'N_05_B', nodeName: 'b) Land Development Fund', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 2, depth: 1 },
  { id: 'node-05-c', scheduleCode: 'SCH_05', nodeCode: 'N_05_C', nodeName: 'c) Equipment Creation Fund', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 3, depth: 1 },
  { id: 'node-05-d', scheduleCode: 'SCH_05', nodeCode: 'N_05_D', nodeName: 'd) Working Capital Reserve', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 4, depth: 1 },
  { id: 'node-05-e', scheduleCode: 'SCH_05', nodeCode: 'N_05_E', nodeName: 'e) Grant Received for Convention Centre *', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 5, depth: 1 },
  { id: 'node-05-f', scheduleCode: 'SCH_05', nodeCode: 'N_05_F', nodeName: 'f) Grant/Donation for Ashram, Research & Skill Development', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 6, depth: 1 },
  { id: 'node-05-g', scheduleCode: 'SCH_05', nodeCode: 'N_05_G', nodeName: 'g) Grant/Donation for Other Construction/Projects', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 7, depth: 1 },
  { id: 'node-05-h', scheduleCode: 'SCH_05', nodeCode: 'N_05_H', nodeName: 'h) ACCDS Project assistance', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 8, depth: 1 },
  { id: 'node-05-i', scheduleCode: 'SCH_05', nodeCode: 'N_05_I', nodeName: 'i) Live Stock Reserve', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 9, depth: 1 },
  { id: 'node-05-j', scheduleCode: 'SCH_05', nodeCode: 'N_05_J', nodeName: 'j) Loose Gold/ Silver Reserve #', nodeType: 'SUB_SCHEDULE', balanceNature: 'CREDIT', displayOrder: 10, depth: 1 },
  { id: 'node-05-k', scheduleCode: 'SCH_05', nodeCode: 'N_05_K', nodeName: 'k) Surplus (Deficit)%', nodeType: 'CALCULATED', balanceNature: 'CREDIT', displayOrder: 11, depth: 1 },
  { id: 'node-05-tot', scheduleCode: 'SCH_05', nodeCode: 'N_05_TOT', nodeName: 'Total Reserves & Surplus', nodeType: 'TOTAL', balanceNature: 'CREDIT', displayOrder: 12, depth: 0 },

  // ── Note 6: Secured Loans ─────────────────────────────────────────────────
  { id: 'node-06-nc-hdr', scheduleCode: 'SCH_06', nodeCode: 'N_06_NC_HDR', nodeName: 'Non-Current', nodeType: 'HEADER', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-06-nc-tb', scheduleCode: 'SCH_06', parentNodeCode: 'N_06_NC_HDR', nodeCode: 'N_06_NC_TB', nodeName: 'Term Loans from Banks', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 1 },
  { id: 'node-06-nc-wc', scheduleCode: 'SCH_06', parentNodeCode: 'N_06_NC_HDR', nodeCode: 'N_06_NC_WC', nodeName: 'Working Capital Loans from Banks', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 3, depth: 1 },
  { id: 'node-06-c-hdr', scheduleCode: 'SCH_06', nodeCode: 'N_06_C_HDR', nodeName: 'Current', nodeType: 'HEADER', balanceNature: 'CREDIT', displayOrder: 4, depth: 0 },
  { id: 'node-06-c-nbfc', scheduleCode: 'SCH_06', parentNodeCode: 'N_06_C_HDR', nodeCode: 'N_06_C_NBFC', nodeName: 'Term Loans from Non Banking Finance Company and Others', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 5, depth: 1 },
  { id: 'node-06-c-wc', scheduleCode: 'SCH_06', parentNodeCode: 'N_06_C_HDR', nodeCode: 'N_06_C_WC', nodeName: 'Working Capital Loans from Banks', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 6, depth: 1 },

  // ── Note 7: Unsecured Loans ───────────────────────────────────────────────
  { id: 'node-07-dev', scheduleCode: 'SCH_07', nodeCode: 'N_07_DEV', nodeName: 'Temporary returnable assistance from devotees*', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },

  // ── Note 8: Sundry Creditors (Protected Accounts) ─────────────────────────
  { id: 'node-08-tp', scheduleCode: 'SCH_08', nodeCode: 'N_08_TP', nodeName: 'Trade Payables #', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', isProtectedAccount: true, displayOrder: 1, depth: 0 },
  { id: 'node-08-oc', scheduleCode: 'SCH_08', nodeCode: 'N_08_OC', nodeName: 'Other Creditors #', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', isProtectedAccount: true, displayOrder: 2, depth: 0 },
  { id: 'node-08-tot', scheduleCode: 'SCH_08', nodeCode: 'N_08_TOT', nodeName: 'Total Sundry Creditors', nodeType: 'TOTAL', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },

  // ── Note 9: Other Current Liabilities ─────────────────────────────────────
  { id: 'node-09-ugc', scheduleCode: 'SCH_09', nodeCode: 'N_09_UGC', nodeName: 'Unspend Grand-Capital Item', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-09-ugr', scheduleCode: 'SCH_09', nodeCode: 'N_09_UGR', nodeName: 'Unspend Grant-Revenue nature', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 0 },
  { id: 'node-09-ugk', scheduleCode: 'SCH_09', nodeCode: 'N_09_UGK', nodeName: 'Unspend grand capital nature', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },
  { id: 'node-09-adv', scheduleCode: 'SCH_09', nodeCode: 'N_09_ADV', nodeName: 'Advance Received from Customers/ students/ Patients', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', isProtectedAccount: true, displayOrder: 4, depth: 0 },
  { id: 'node-09-caut', scheduleCode: 'SCH_09', nodeCode: 'N_09_CAUT', nodeName: 'Caution Deposit', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 5, depth: 0 },
  { id: 'node-09-oth', scheduleCode: 'SCH_09', nodeCode: 'N_09_OTH', nodeName: 'Others', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 6, depth: 0 },

  // ── Note 10: Short Term Liabilities and Provisions ────────────────────────
  { id: 'node-10-a-hdr', scheduleCode: 'SCH_10', nodeCode: 'N_10_A_HDR', nodeName: 'a) Short Term Liabilities', nodeType: 'HEADER', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-10-a-sal', scheduleCode: 'SCH_10', parentNodeCode: 'N_10_A_HDR', nodeCode: 'N_10_A_SAL', nodeName: 'Salary payables', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 1 },
  { id: 'node-10-a-fee', scheduleCode: 'SCH_10', parentNodeCode: 'N_10_A_HDR', nodeCode: 'N_10_A_FEE', nodeName: 'Fees in Advance', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 3, depth: 1 },
  { id: 'node-10-a-ret', scheduleCode: 'SCH_10', parentNodeCode: 'N_10_A_HDR', nodeCode: 'N_10_A_RET', nodeName: 'Retention against bills', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 4, depth: 1 },
  { id: 'node-10-a-stat', scheduleCode: 'SCH_10', parentNodeCode: 'N_10_A_HDR', nodeCode: 'N_10_A_STAT', nodeName: 'Other liabilities including statutory liabilities', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 5, depth: 1 },
  { id: 'node-10-b-hdr', scheduleCode: 'SCH_10', nodeCode: 'N_10_B_HDR', nodeName: 'b) Provisions for Expense', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 6, depth: 0 },

  // ── Note 11: Tangible Assets (PPE) ────────────────────────────────────────
  { id: 'node-11-land-fh', scheduleCode: 'SCH_11', nodeCode: 'N_11_LAND_FH', nodeName: 'Free hold Land-(Foot Note 1)', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 1, depth: 1 },
  { id: 'node-11-land-lh', scheduleCode: 'SCH_11', nodeCode: 'N_11_LAND_LH', nodeName: 'Lease hold Land', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 2, depth: 1 },
  { id: 'node-11-guru', scheduleCode: 'SCH_11', nodeCode: 'N_11_GURU', nodeName: 'Gururoopam', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 3, depth: 1 },
  { id: 'node-11-gold', scheduleCode: 'SCH_11', nodeCode: 'N_11_GOLD', nodeName: 'Loose Gold/ Silver, diamond, stones * (refer Note 3.10)', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 4, depth: 1 },
  { id: 'node-11-bld-ch', scheduleCode: 'SCH_11', nodeCode: 'N_11_BLD_CH', nodeName: 'Community and other Charitable Building', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 5, depth: 1 },
  { id: 'node-11-bld-och', scheduleCode: 'SCH_11', nodeCode: 'N_11_BLD_OCH', nodeName: 'Other than Charitable Building-(Foot Note 2)', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 6, depth: 1 },
  { id: 'node-11-sci-bld', scheduleCode: 'SCH_11', nodeCode: 'N_11_SCI_BLD', nodeName: 'Scientific R & D Building', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 7, depth: 1 },
  { id: 'node-11-sci-eq', scheduleCode: 'SCH_11', nodeCode: 'N_11_SCI_EQ', nodeName: 'Scientific R & D Equipments', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 8, depth: 1 },
  { id: 'node-11-sci-oth', scheduleCode: 'SCH_11', nodeCode: 'N_11_SCI_OTH', nodeName: 'Scientific R & D Other assets', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 9, depth: 1 },
  { id: 'node-11-soc-bld', scheduleCode: 'SCH_11', nodeCode: 'N_11_SOC_BLD', nodeName: 'Social Research Building', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 10, depth: 1 },
  { id: 'node-11-soc-oth', scheduleCode: 'SCH_11', nodeCode: 'N_11_SOC_OTH', nodeName: 'Social Research Other Assets', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 11, depth: 1 },
  { id: 'node-11-plant', scheduleCode: 'SCH_11', nodeCode: 'N_11_PLANT', nodeName: 'Plant & Machinery,Tools & Equipments', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 12, depth: 1 },
  { id: 'node-11-office', scheduleCode: 'SCH_11', nodeCode: 'N_11_OFFICE', nodeName: 'Office Equipment', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 13, depth: 1 },
  { id: 'node-11-comp', scheduleCode: 'SCH_11', nodeCode: 'N_11_COMP', nodeName: 'Computer', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 14, depth: 1 },
  { id: 'node-11-veh', scheduleCode: 'SCH_11', nodeCode: 'N_11_VEH', nodeName: 'Vehicles', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 15, depth: 1 },
  { id: 'node-11-furn', scheduleCode: 'SCH_11', nodeCode: 'N_11_FURN', nodeName: 'Furniture and Fixtures', nodeType: 'SUB_SCHEDULE', balanceNature: 'DEBIT', displayOrder: 16, depth: 1 },
  { id: 'node-11-tot', scheduleCode: 'SCH_11', nodeCode: 'N_11_TOT', nodeName: 'Total PPE', nodeType: 'TOTAL', balanceNature: 'DEBIT', displayOrder: 17, depth: 0 },

  // ── Note 12: Capital Work in Progress ─────────────────────────────────────
  { id: 'node-12-bld-ch', scheduleCode: 'SCH_12', nodeCode: 'N_12_BLD_CH', nodeName: 'Community and other Charitable Building', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-12-sci-bld', scheduleCode: 'SCH_12', nodeCode: 'N_12_SCI_BLD', nodeName: 'Scientific R & D Building', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-12-conv', scheduleCode: 'SCH_12', nodeCode: 'N_12_CONV', nodeName: 'Convention Centre', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-12-coir', scheduleCode: 'SCH_12', nodeCode: 'N_12_COIR', nodeName: 'Koottukudumba Coir (ACCDS Project)', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },
  { id: 'node-12-stp', scheduleCode: 'SCH_12', nodeCode: 'N_12_STP', nodeName: 'STP and Sub-Station Unit', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 5, depth: 0 },
  { id: 'node-12-schl', scheduleCode: 'SCH_12', nodeCode: 'N_12_SCHL', nodeName: 'School and College Building', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 6, depth: 0 },
  { id: 'node-12-oth', scheduleCode: 'SCH_12', nodeCode: 'N_12_OTH', nodeName: 'Other Building and Facilities', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 7, depth: 0 },

  // ── Note 13: Live stock ───────────────────────────────────────────────────
  { id: 'node-13-cows', scheduleCode: 'SCH_13', nodeCode: 'N_13_COWS', nodeName: 'Cows#', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },

  // ── Note 14: Trade Receivable (Protected Accounts) ────────────────────────
  { id: 'node-14-sec', scheduleCode: 'SCH_14', nodeCode: 'N_14_SEC', nodeName: 'Secured,Considred Good', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, displayOrder: 1, depth: 0 },
  { id: 'node-14-unsec', scheduleCode: 'SCH_14', nodeCode: 'N_14_UNSEC', nodeName: 'Unsecured, Considred Good', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, displayOrder: 2, depth: 0 },
  { id: 'node-14-dbt', scheduleCode: 'SCH_14', nodeCode: 'N_14_DBT', nodeName: 'Doubt full', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, displayOrder: 3, depth: 0 },
  { id: 'node-14-prov', scheduleCode: 'SCH_14', nodeCode: 'N_14_PROV', nodeName: 'Less:- Provision for doubtful trade Receivable', nodeType: 'MOVEMENT', movementType: 'DEDUCTION', balanceNature: 'CREDIT', displayOrder: 4, depth: 0 },

  // ── Note 15: Cash and bank balances ───────────────────────────────────────
  { id: 'node-15-cash', scheduleCode: 'SCH_15', nodeCode: 'N_15_CASH', nodeName: 'Cash on hand (Verified and Certified by Management)', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-15-chq', scheduleCode: 'SCH_15', nodeCode: 'N_15_CHQ', nodeName: ' - Cheques in Hand', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-15-curr', scheduleCode: 'SCH_15', nodeCode: 'N_15_CURR', nodeName: ' - in Current accounts - (Foot Note i,ii)', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-15-sav', scheduleCode: 'SCH_15', nodeCode: 'N_15_SAV', nodeName: ' - in Saving accounts', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },
  { id: 'node-15-dep-st', scheduleCode: 'SCH_15', nodeCode: 'N_15_DEP_ST', nodeName: ' - Other bank balance (Deposits maturing < 3 months)', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 5, depth: 0 },

  // ── Note 16: Investments ──────────────────────────────────────────────────
  { id: 'node-16-fd-lt', scheduleCode: 'SCH_16', nodeCode: 'N_16_FD_LT', nodeName: ' - Fixed Deposit - (Foot Note ii,iii) (Deposits maturing above 12 months)', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },

  // ── Note 17: Inventories ──────────────────────────────────────────────────
  { id: 'node-17-rm', scheduleCode: 'SCH_17', nodeCode: 'N_17_RM', nodeName: 'Raw Material*', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-17-wip', scheduleCode: 'SCH_17', nodeCode: 'N_17_WIP', nodeName: 'Work in Process*', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-17-fg', scheduleCode: 'SCH_17', nodeCode: 'N_17_FG', nodeName: 'Finished Goods*', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-17-trade', scheduleCode: 'SCH_17', nodeCode: 'N_17_TRADE', nodeName: 'Trading Items*', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },
  { id: 'node-17-oth', scheduleCode: 'SCH_17', nodeCode: 'N_17_OTH', nodeName: 'Other than Manufacturing & Trading Units', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 5, depth: 0 },

  // ── Note 18: Short term loans and advances ─────────────────────────────────
  { id: 'node-18-emp', scheduleCode: 'SCH_18', nodeCode: 'N_18_EMP', nodeName: '.Loans and advances to employees', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, displayOrder: 1, depth: 0 },
  { id: 'node-18-sd-c', scheduleCode: 'SCH_18', nodeCode: 'N_18_SD_C', nodeName: 'Security deposits Current', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, displayOrder: 2, depth: 0 },
  { id: 'node-18-sd-nc', scheduleCode: 'SCH_18', nodeCode: 'N_18_SD_NC', nodeName: 'Security deposits Non- Current', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, targetStatementLine: 'BS_NCA_OTH', displayOrder: 3, depth: 0 },
  { id: 'node-18-oth-c', scheduleCode: 'SCH_18', nodeCode: 'N_18_OTH_C', nodeName: 'Other loans and advances or recoverable in cash or kind Current', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', isProtectedAccount: true, displayOrder: 4, depth: 0 },
  { id: 'node-18-less-nc', scheduleCode: 'SCH_18', nodeCode: 'N_18_LESS_NC', nodeName: 'Less:Non Current Security deposits', nodeType: 'MOVEMENT', movementType: 'DEDUCTION', balanceNature: 'CREDIT', displayOrder: 5, depth: 0 },
  { id: 'node-18-net-c', scheduleCode: 'SCH_18', nodeCode: 'N_18_NET_C', nodeName: 'Current Portion of Loans & Advances', nodeType: 'CALCULATED', balanceNature: 'DEBIT', displayOrder: 6, depth: 0 },

  // ── Note 19: Other Current Assets ─────────────────────────────────────────
  { id: 'node-19-tax', scheduleCode: 'SCH_19', nodeCode: 'N_19_TAX', nodeName: 'Advance income tax including TDS', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-19-grant', scheduleCode: 'SCH_19', nodeCode: 'N_19_GRANT', nodeName: 'Grant Receivable', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-19-oth', scheduleCode: 'SCH_19', nodeCode: 'N_19_OTH', nodeName: 'Other Current Assets', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-19-dep-med', scheduleCode: 'SCH_19', nodeCode: 'N_19_DEP_MED', nodeName: 'Deposits maturing above 3 months but less than 12 months', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },

  // ── Note 20: Donations and Grant in Aid ────────────────────────────────────
  { id: 'node-20-don', scheduleCode: 'SCH_20', nodeCode: 'N_20_DON', nodeName: 'Donations', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-20-kind', scheduleCode: 'SCH_20', nodeCode: 'N_20_KIND', nodeName: 'Donation Received in kind', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 0 },
  { id: 'node-20-grant', scheduleCode: 'SCH_20', nodeCode: 'N_20_GRANT', nodeName: 'Grants in Aid', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },
  { id: 'node-20-oth', scheduleCode: 'SCH_20', nodeCode: 'N_20_OTH', nodeName: 'Other Collections', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 4, depth: 0 },

  // ── Note 21: Donations for Research ───────────────────────────────────────
  { id: 'node-21-sci', scheduleCode: 'SCH_21', nodeCode: 'N_21_SCI', nodeName: 'Donation/ Grant in Aid for Scientific and Industrial Research', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-21-soc', scheduleCode: 'SCH_21', nodeCode: 'N_21_SOC', nodeName: 'Donation/ Grant in Aid for Social Research', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 0 },

  // ── Note 22: Revenue from operations ──────────────────────────────────────
  { id: 'node-22-sal-ker', scheduleCode: 'SCH_22', nodeCode: 'N_22_SAL_KER', nodeName: 'Sales at Kerala (Note 3.16)', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-22-sal-out', scheduleCode: 'SCH_22', nodeCode: 'N_22_SAL_OUT', nodeName: 'Sales Outside Kerala (Note 3.16)', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 0 },
  { id: 'node-22-edu', scheduleCode: 'SCH_22', nodeCode: 'N_22_EDU', nodeName: 'Income from Educational Activity', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },
  { id: 'node-22-hlth', scheduleCode: 'SCH_22', nodeCode: 'N_22_HLTH', nodeName: 'Income from Healthcare Activity', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 4, depth: 0 },
  { id: 'node-22-oth', scheduleCode: 'SCH_22', nodeCode: 'N_22_OTH', nodeName: 'Revenue from Other Operations', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 5, depth: 0 },
  { id: 'node-22-disc', scheduleCode: 'SCH_22', nodeCode: 'N_22_DISC', nodeName: 'Discounts and Rebates', nodeType: 'MOVEMENT', movementType: 'DEDUCTION', balanceNature: 'DEBIT', displayOrder: 6, depth: 0 },

  // ── Note 23: Agriculture, Dairy Income ────────────────────────────────────
  { id: 'node-23-agri', scheduleCode: 'SCH_23', nodeCode: 'N_23_AGRI', nodeName: 'Agriculture Income', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-23-dairy', scheduleCode: 'SCH_23', nodeCode: 'N_23_DAIRY', nodeName: 'Dairy Income', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 0 },

  // ── Note 24: Other income ─────────────────────────────────────────────────
  { id: 'node-24-int', scheduleCode: 'SCH_24', nodeCode: 'N_24_INT', nodeName: 'Interest Income', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 1, depth: 0 },
  { id: 'node-24-dd', scheduleCode: 'SCH_24', nodeCode: 'N_24_DD', nodeName: 'Duty Drawback Received', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 2, depth: 0 },
  { id: 'node-24-misc', scheduleCode: 'SCH_24', nodeCode: 'N_24_MISC', nodeName: 'Mise Income/Research service', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },
  { id: 'node-24-fa-prof', scheduleCode: 'SCH_24', nodeCode: 'N_24_FA_PROF', nodeName: 'Profit on Sale of Other Fixed Asset (Net)', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 4, depth: 0 },
  { id: 'node-24-lnd-prof', scheduleCode: 'SCH_24', nodeCode: 'N_24_LND_PROF', nodeName: 'Profit on Sale of Land & Building (Net)', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 5, depth: 0 },
  { id: 'node-24-veh-prof', scheduleCode: 'SCH_24', nodeCode: 'N_24_VEH_PROF', nodeName: 'Profit(Loss) on Sale of Vehicle (Net)', nodeType: 'LINE_ITEM', balanceNature: 'CREDIT', displayOrder: 6, depth: 0 },

  // ── Note 25: Increase (Decrease) in Inventories ───────────────────────────
  { id: 'node-25-cl-hdr', scheduleCode: 'SCH_25', nodeCode: 'N_25_CL_HDR', nodeName: 'Closing Stock', nodeType: 'HEADER', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-25-cl-mfg', scheduleCode: 'SCH_25', parentNodeCode: 'N_25_CL_HDR', nodeCode: 'N_25_CL_MFG', nodeName: 'Manufacturing Units', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 1 },
  { id: 'node-25-cl-wip', scheduleCode: 'SCH_25', parentNodeCode: 'N_25_CL_HDR', nodeCode: 'N_25_CL_WIP', nodeName: 'WIP', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 1 },
  { id: 'node-25-cl-oth', scheduleCode: 'SCH_25', parentNodeCode: 'N_25_CL_HDR', nodeCode: 'N_25_CL_OTH', nodeName: 'Other than Manufacturing & Trading Units', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 1 },
  { id: 'node-25-op-hdr', scheduleCode: 'SCH_25', nodeCode: 'N_25_OP_HDR', nodeName: 'Opening Stock', nodeType: 'HEADER', balanceNature: 'DEBIT', displayOrder: 5, depth: 0 },
  { id: 'node-25-op-mfg', scheduleCode: 'SCH_25', parentNodeCode: 'N_25_OP_HDR', nodeCode: 'N_25_OP_MFG', nodeName: 'Manufacturing Units', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 6, depth: 1 },
  { id: 'node-25-op-wip', scheduleCode: 'SCH_25', parentNodeCode: 'N_25_OP_HDR', nodeCode: 'N_25_OP_WIP', nodeName: 'WIP', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 7, depth: 1 },
  { id: 'node-25-op-oth', scheduleCode: 'SCH_25', parentNodeCode: 'N_25_OP_HDR', nodeCode: 'N_25_OP_OTH', nodeName: 'Other than Manufacturing & Trading Units', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 8, depth: 1 },
  { id: 'node-25-net', scheduleCode: 'SCH_25', nodeCode: 'N_25_NET', nodeName: 'Increase (Decrease)', nodeType: 'CALCULATED', balanceNature: 'CREDIT', displayOrder: 9, depth: 0 },

  // ── Note 26: Community Welfare, Charitable Application ───────────────────
  { id: 'node-26-edu', scheduleCode: 'SCH_26', nodeCode: 'N_26_EDU', nodeName: 'Free Education to Poor and deserving Students', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-26-food', scheduleCode: 'SCH_26', nodeCode: 'N_26_FOOD', nodeName: 'Free Food (Annadanam)', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-26-med', scheduleCode: 'SCH_26', nodeCode: 'N_26_MED', nodeName: 'Free Medicines & Treatment Expense to needy', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-26-oth-asst', scheduleCode: 'SCH_26', nodeCode: 'N_26_OTH_ASST', nodeName: 'Other Assistance to Poor / needy', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },
  { id: 'node-26-fest', scheduleCode: 'SCH_26', nodeCode: 'N_26_FEST', nodeName: 'Function & Festival Expenses', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 5, depth: 0 },
  { id: 'node-26-adm', scheduleCode: 'SCH_26', nodeCode: 'N_26_ADM', nodeName: 'Other Administrative Expense', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 6, depth: 0 },

  // ── Note 27: Application for Social & Scientific Research ────────────────
  { id: 'node-27-sci', scheduleCode: 'SCH_27', nodeCode: 'N_27_SCI', nodeName: 'For Scientific and Industrial Research', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-27-soc', scheduleCode: 'SCH_27', nodeCode: 'N_27_SOC', nodeName: 'For Social Research', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },

  // ── Note 28: Consumption of material, stores and others ──────────────────
  { id: 'node-28-op-rm', scheduleCode: 'SCH_28', nodeCode: 'N_28_OP_RM', nodeName: 'Opening Stock Raw Material', nodeType: 'MOVEMENT', movementType: 'OPENING', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-28-pur', scheduleCode: 'SCH_28', nodeCode: 'N_28_PUR', nodeName: 'Add : Purchase', nodeType: 'MOVEMENT', movementType: 'ADDITION', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-28-cl-rm', scheduleCode: 'SCH_28', nodeCode: 'N_28_CL_RM', nodeName: 'Less: Closing Stock Raw Material', nodeType: 'MOVEMENT', movementType: 'DEDUCTION', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },
  { id: 'node-28-cons', scheduleCode: 'SCH_28', nodeCode: 'N_28_CONS', nodeName: 'Consumptions', nodeType: 'CALCULATED', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },

  // ── Note 29: Cost of Trading Items sold ──────────────────────────────────
  { id: 'node-29-op-trd', scheduleCode: 'SCH_29', nodeCode: 'N_29_OP_TRD', nodeName: 'Opening Stock', nodeType: 'MOVEMENT', movementType: 'OPENING', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-29-pur', scheduleCode: 'SCH_29', nodeCode: 'N_29_PUR', nodeName: 'Add : Purchase', nodeType: 'MOVEMENT', movementType: 'ADDITION', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-29-cl-trd', scheduleCode: 'SCH_29', nodeCode: 'N_29_CL_TRD', nodeName: 'Less: Closing Stock', nodeType: 'MOVEMENT', movementType: 'DEDUCTION', balanceNature: 'CREDIT', displayOrder: 3, depth: 0 },
  { id: 'node-29-cogs', scheduleCode: 'SCH_29', nodeCode: 'N_29_COGS', nodeName: 'Cost of Trading Items Sold', nodeType: 'CALCULATED', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },

  // ── Note 30: Agriculture, Dairy Expense ──────────────────────────────────
  { id: 'node-30-agri', scheduleCode: 'SCH_30', nodeCode: 'N_30_AGRI', nodeName: 'Other Agricultural Expenses', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-30-cat-med', scheduleCode: 'SCH_30', nodeCode: 'N_30_CAT_MED', nodeName: 'Medical expense for Cattle', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-30-cat-feed', scheduleCode: 'SCH_30', nodeCode: 'N_30_CAT_FEED', nodeName: 'Feeds for Cattle', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-30-dairy-oth', scheduleCode: 'SCH_30', nodeCode: 'N_30_DAIRY_OTH', nodeName: 'Other Dairy Expenses', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },

  // ── Note 31: Employee benefits expenses ──────────────────────────────────
  { id: 'node-31-sal', scheduleCode: 'SCH_31', nodeCode: 'N_31_SAL', nodeName: 'Salaries', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-31-lwf', scheduleCode: 'SCH_31', nodeCode: 'N_31_LWF', nodeName: 'Contribution to labour welfare fund', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-31-welf', scheduleCode: 'SCH_31', nodeCode: 'N_31_WELF', nodeName: 'Staff  Medical & welfare expenses', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },

  // ── Note 32: Finance Cost ────────────────────────────────────────────────
  { id: 'node-32-int-borr', scheduleCode: 'SCH_32', nodeCode: 'N_32_INT_BORR', nodeName: 'Interest on borrowings', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-32-int-stat', scheduleCode: 'SCH_32', nodeCode: 'N_32_INT_STAT', nodeName: 'Interest on statutory dues', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-32-bank-chg', scheduleCode: 'SCH_32', nodeCode: 'N_32_BANK_CHG', nodeName: 'Bank charges', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },

  // ── Note 33: Administrative and Other expenses ───────────────────────────
  { id: 'node-33-rent', scheduleCode: 'SCH_33', nodeCode: 'N_33_RENT', nodeName: 'Rent', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 1, depth: 0 },
  { id: 'node-33-rep', scheduleCode: 'SCH_33', nodeCode: 'N_33_REP', nodeName: 'Repairs & Maintenance', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 2, depth: 0 },
  { id: 'node-33-tax', scheduleCode: 'SCH_33', nodeCode: 'N_33_TAX', nodeName: 'Rates & taxes', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 3, depth: 0 },
  { id: 'node-33-power', scheduleCode: 'SCH_33', nodeCode: 'N_33_POWER', nodeName: 'Power & fuel', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 4, depth: 0 },
  { id: 'node-33-prof', scheduleCode: 'SCH_33', nodeCode: 'N_33_PROF', nodeName: 'Professional Charges', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 5, depth: 0 },
  { id: 'node-33-adm', scheduleCode: 'SCH_33', nodeCode: 'N_33_ADM', nodeName: 'Administration expense', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 6, depth: 0 },
  { id: 'node-33-comm', scheduleCode: 'SCH_33', nodeCode: 'N_33_COMM', nodeName: 'Communication expense', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 7, depth: 0 },
  { id: 'node-33-ins', scheduleCode: 'SCH_33', nodeCode: 'N_33_INS', nodeName: 'Insurance expense', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 8, depth: 0 },
  { id: 'node-33-trav', scheduleCode: 'SCH_33', nodeCode: 'N_33_TRAV', nodeName: 'Travelling & conveyance', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 9, depth: 0 },
  { id: 'node-33-veh', scheduleCode: 'SCH_33', nodeCode: 'N_33_VEH', nodeName: 'Vehicle Running & Maintenance', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 10, depth: 0 },
  { id: 'node-33-prom', scheduleCode: 'SCH_33', nodeCode: 'N_33_PROM', nodeName: 'Business promotion expenses', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 11, depth: 0 },
  { id: 'node-33-stat', scheduleCode: 'SCH_33', nodeCode: 'N_33_STAT', nodeName: 'Printing & stationery', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 12, depth: 0 },
  { id: 'node-33-audit', scheduleCode: 'SCH_33', nodeCode: 'N_33_AUDIT', nodeName: 'Auditors Remuneration', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 13, depth: 0 },
  { id: 'node-33-bad', scheduleCode: 'SCH_33', nodeCode: 'N_33_BAD', nodeName: 'Bad Debts Written Off', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 14, depth: 0 },
  { id: 'node-33-fine', scheduleCode: 'SCH_33', nodeCode: 'N_33_FINE', nodeName: 'Fine & Penalty', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 15, depth: 0 },
  { id: 'node-33-edu', scheduleCode: 'SCH_33', nodeCode: 'N_33_EDU', nodeName: 'Expense for Educational Activity', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 16, depth: 0 },
  { id: 'node-33-hlth', scheduleCode: 'SCH_33', nodeCode: 'N_33_HLTH', nodeName: 'Expense for Healthcare Activity', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 17, depth: 0 },
  { id: 'node-33-trade', scheduleCode: 'SCH_33', nodeCode: 'N_33_TRADE', nodeName: 'Trading and other charges', nodeType: 'LINE_ITEM', balanceNature: 'DEBIT', displayOrder: 18, depth: 0 },
];

export const DEFAULT_FSLI_TO_NODE_MAPPINGS: FSLIToNodeMappingDef[] = [
  // Equity
  { fsliCode: 'EQ_CAP_FUND', nodeCode: 'N_04_BF' },
  { fsliCode: 'EQ_RES_SURP', nodeCode: 'N_05_D' },

  // Non-Current Liabilities
  { fsliCode: 'NCL_LT_BORR', nodeCode: 'N_06_NC_TB' },
  { fsliCode: 'NON_CRT_LIBLTY', nodeCode: 'N_06_NC_TB' },
  { fsliCode: 'NON_CRT_LIBLTY_C1', nodeCode: 'N_06_NC_TB' },
  { fsliCode: 'NCL_OTH_LIAB', nodeCode: 'N_07_DEV' },
  { fsliCode: 'UN_SECD_LNS', nodeCode: 'N_07_DEV' },
  { fsliCode: 'UN_SECD_LNS_C1', nodeCode: 'N_07_DEV' },
  { fsliCode: 'NON_CRT_LIBLTY_C2', nodeCode: 'N_07_DEV' },
  { fsliCode: 'NCL_LT_PROV', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'NCL_DEF_TAX', nodeCode: 'N_09_OTH' },

  // Current Liabilities
  { fsliCode: 'CL_ST_BORR', nodeCode: 'N_06_C_NBFC' },
  { fsliCode: 'CL_TRADE_PAY', nodeCode: 'N_08_TP' },
  { fsliCode: 'SUN_CRD_S', nodeCode: 'N_08_TP' },
  { fsliCode: 'SUN_CRD_S_C1', nodeCode: 'N_08_TP' },
  { fsliCode: 'SUN_CRD_S_C2', nodeCode: 'N_08_OTH' },
  { fsliCode: 'CL_OTH_LIAB', nodeCode: 'N_09_OTH' },
  { fsliCode: 'CL_OTH_LIAB_C1', nodeCode: 'N_09_OTH' },
  { fsliCode: 'CL_OTH_LIAB_C2', nodeCode: 'N_09_OTH' },
  { fsliCode: 'CL_OTH_LIAB_C3', nodeCode: 'N_09_OTH' },
  { fsliCode: 'CL_ST_PROV', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'CL_ST_PROV_C1', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'CL_ST_PROV_C2', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'CL_ST_PROV_C3', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'CL_ST_PROV_C4', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'CL_ST_PROV_C5', nodeCode: 'N_10_B_HDR' },
  { fsliCode: 'CL_DUTIES_TAX', nodeCode: 'N_10_A_STAT' },

  // Non-Current Assets
  { fsliCode: 'NCA_PPE', nodeCode: 'N_11_PLANT' },
  { fsliCode: 'NCA_CWIP', nodeCode: 'N_12_BLD_CH' },
  { fsliCode: 'NCA_INTANG', nodeCode: 'N_11_COMP' },
  { fsliCode: 'NCA_NC_INV', nodeCode: 'N_16_FD_LT' },
  { fsliCode: 'NCA_DEF_TAX', nodeCode: 'N_19_OTH' },
  { fsliCode: 'NCA_LT_LOAN', nodeCode: 'N_18_SD_NC' },
  { fsliCode: 'NCA_OTH_ASSET', nodeCode: 'N_18_SD_NC' },

  // Current Assets
  { fsliCode: 'CA_CURR_INV', nodeCode: 'N_19_DEP_MED' },
  { fsliCode: 'CA_INVENT', nodeCode: 'N_17_RM' },
  { fsliCode: 'CA_TRADE_REC', nodeCode: 'N_14_UNSEC' },
  { fsliCode: 'CA_TRADE_REC_C1', nodeCode: 'N_14_UNSEC' },
  { fsliCode: 'CA_TRADE_REC_C2', nodeCode: 'N_14_UNSEC' },
  { fsliCode: 'CA_CASH_EQUIV', nodeCode: 'N_15_CASH' },
  { fsliCode: 'CA_BANK_BAL', nodeCode: 'N_15_CURR' },
  { fsliCode: 'CA_ST_LOAN', nodeCode: 'N_18_EMP' },
  { fsliCode: 'CA_ST_LOAN_C1', nodeCode: 'N_18_EMP' },
  { fsliCode: 'CA_ST_LOAN_C2', nodeCode: 'N_18_OTH_C' },
  { fsliCode: 'CA_OTH_ASSET', nodeCode: 'N_19_OTH' },
  { fsliCode: 'BRAN_DIV-S', nodeCode: 'N_19_OTH' },
  { fsliCode: 'BRAN_DIV-S_C1', nodeCode: 'N_19_OTH' },
  { fsliCode: 'BRAN_DIV-S_C2', nodeCode: 'N_19_OTH' },

  // Income
  { fsliCode: 'INC_REV_OPS', nodeCode: 'N_22_SAL_KER' },
  { fsliCode: 'INC_REV_OPS_C1', nodeCode: 'N_22_DISC' },
  { fsliCode: 'INC_REV_OPS_C2', nodeCode: 'N_22_HLTH' },
  { fsliCode: 'INC_REV_OPS_C3', nodeCode: 'N_22_SAL_KER' },
  { fsliCode: 'INC_REV_OPS_C4', nodeCode: 'N_22_SAL_OUT' },
  { fsliCode: 'INC_OTH_INC', nodeCode: 'N_24_INT' },
  { fsliCode: 'INC_DON_GRANT', nodeCode: 'N_20_DON' },
  { fsliCode: 'AG_DRY_INC', nodeCode: 'N_23_AGRI' },

  // Expenses
  { fsliCode: 'EXP_MAT_CONS', nodeCode: 'N_28_PUR' },
  { fsliCode: 'CONS_MATRS_STRS', nodeCode: 'N_28_PUR' },
  { fsliCode: 'EXP_PUR_STOCK', nodeCode: 'N_29_PUR' },
  { fsliCode: 'COST_TDG_SLD', nodeCode: 'N_29_PUR' },
  { fsliCode: 'EXP_CHG_INV', nodeCode: 'N_25_NET' },
  { fsliCode: 'INC_DECR_FG', nodeCode: 'N_25_NET' },
  { fsliCode: 'EXP_EMP_BEN', nodeCode: 'N_31_SAL' },
  { fsliCode: 'EXP_EMP_BEN_C1', nodeCode: 'N_31_SAL' },
  { fsliCode: 'EXP_EMP_BEN_C2', nodeCode: 'N_31_LWF' },
  { fsliCode: 'EXP_EMP_BEN_C3', nodeCode: 'N_31_WELF' },
  { fsliCode: 'EXP_FIN_COST', nodeCode: 'N_32_INT_BORR' },
  { fsliCode: 'EXP_DEP_AMORT', nodeCode: 'N_11_TOT' },
  { fsliCode: 'EXP_ADMIN_GEN', nodeCode: 'N_33_ADM' },
  { fsliCode: 'EXP_OTH_EXP', nodeCode: 'N_33_TRADE' },
  { fsliCode: 'COM_WFR', nodeCode: 'N_26_EDU' },
  { fsliCode: 'EXP_SRA', nodeCode: 'N_27_SCI' },
  { fsliCode: 'AGR_DRY_EXP', nodeCode: 'N_30_AGRI' },

  // ── Finance Cost child FSLIs → Schedule 32 line-item nodes ──────────
  { fsliCode: 'EXP_FIN_COST_C1', nodeCode: 'N_32_BANK_CHG' },
  { fsliCode: 'EXP_FIN_COST_C2', nodeCode: 'N_32_INT_STAT' },
  { fsliCode: 'EXP_FIN_COST_C3', nodeCode: 'N_32_INT_BORR' },

  // ── Admin & General child FSLIs → Schedule 33 line-item nodes ───────
  { fsliCode: 'EXP_ADMIN_GEN_C1', nodeCode: 'N_33_AUDIT' },
  { fsliCode: 'EXP_ADMIN_GEN_C2', nodeCode: 'N_33_PROM' },
  { fsliCode: 'EXP_ADMIN_GEN_C3', nodeCode: 'N_33_RENT' },
  { fsliCode: 'EXP_ADMIN_GEN_C4', nodeCode: 'N_33_REP' },
  { fsliCode: 'EXP_ADMIN_GEN_C5', nodeCode: 'N_33_PROF' },
  { fsliCode: 'EXP_ADMIN_GEN_C6', nodeCode: 'N_33_COMM' },
  { fsliCode: 'EXP_ADMIN_GEN_C7', nodeCode: 'N_33_INS' },
  { fsliCode: 'EXP_ADMIN_GEN_C8', nodeCode: 'N_33_TRAV' },
  { fsliCode: 'EXP_ADMIN_GEN_C9', nodeCode: 'N_33_VEH' },
  { fsliCode: 'EXP_ADMIN_GEN_C10', nodeCode: 'N_33_STAT' },
  { fsliCode: 'EXP_ADMIN_GEN_C11', nodeCode: 'N_33_TAX' },
  { fsliCode: 'EXP_ADMIN_GEN_C12', nodeCode: 'N_33_POWER' },

  // ── Stock Movement child FSLIs → Schedule 25 component nodes ────────
  { fsliCode: 'EXP_CHG_INV_OP_MFG', nodeCode: 'N_25_OP_MFG' },
  { fsliCode: 'EXP_CHG_INV_OP_WIP', nodeCode: 'N_25_OP_WIP' },
  { fsliCode: 'EXP_CHG_INV_OP_OTH', nodeCode: 'N_25_OP_OTH' },
  { fsliCode: 'EXP_CHG_INV_CL_MFG', nodeCode: 'N_25_CL_MFG' },
  { fsliCode: 'EXP_CHG_INV_CL_WIP', nodeCode: 'N_25_CL_WIP' },
  { fsliCode: 'EXP_CHG_INV_CL_OTH', nodeCode: 'N_25_CL_OTH' },
];
