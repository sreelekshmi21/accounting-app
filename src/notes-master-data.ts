/**
 * Authoritative Master Data for Notes to the Financial Statements (Notes 4 through 33)
 * Extracted directly from: reference/Format of Balance sheet , IE and schedules1.xlsx
 *
 * Preserves:
 * - Exact Note Numbers (4 to 33)
 * - Exact Note Titles
 * - Exact Line Item Labels, Headings, Subtotals, and Hierarchy
 * - Exact Footnote references as provided in the workbook (without inventing missing text)
 * - Mapping to Phase 10 Reporting Node Codes from REPORTING_NODES
 */

export type NoteCalculationMethod =
  | 'NODE_BALANCE'
  | 'CORPUS'
  | 'RESERVE_SURPLUS'
  | 'TANGIBLE_ASSETS'
  | 'CWIP'
  | 'LIVE_STOCK'
  | 'LOANS_ADVANCES'
  | 'STOCK_MOVEMENT'
  | 'MATERIAL_CONSUMPTION'
  | 'TRADING_COGS';

export type DisclosureRule =
  | 'SHOW_ALWAYS'
  | 'SHOW_WHEN_NONZERO'
  | 'SHOW_MANDATORY'
  | 'SUPPRESS_EMPTY_GROUP';

export interface NoteLineItemDef {
  lineId: string;
  lineLabel: string;
  lineType: 'HEADER' | 'LINE_ITEM' | 'SUBTOTAL' | 'TOTAL' | 'CALCULATED' | 'DEDUCTION' | 'DISCLOSURE_TEXT' | 'SUB_SCHEDULE';
  sourceNodeCodes: string[];
  parentNodeCode?: string;
  disclosureRule: DisclosureRule;
  displayOrder: number;
  depth: number;
  footnote?: string;
}

export interface NoteDefinition {
  noteNumber: number;
  title: string;
  scheduleCode: string;
  statementCode: 'BS' | 'IE';
  calculationMethod: NoteCalculationMethod;
  calculatorKey?: string;
  lineItems: NoteLineItemDef[];
  footnotes: string[];
  displayOrder: number;
}

export const NOTE_DEFINITIONS: NoteDefinition[] = [
  // ── Note 4: Corpus ──────────────────────────────────────────────────────────
  {
    noteNumber: 4,
    title: 'Corpus',
    scheduleCode: 'SCH_04',
    statementCode: 'BS',
    calculationMethod: 'CORPUS',
    calculatorKey: 'CorpusCalculator',
    displayOrder: 10,
    footnotes: [],
    lineItems: [
      {
        lineId: 'n4-bf',
        lineLabel: 'Balance b/f',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_04_BF'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
      },
      {
        lineId: 'n4-add',
        lineLabel: 'Add : Received During the year',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_04_ADD'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 0,
      },
      {
        lineId: 'n4-tot',
        lineLabel: 'Total Corpus',
        lineType: 'TOTAL',
        sourceNodeCodes: ['N_04_TOT'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 3,
        depth: 0,
      },
    ],
  },

  // ── Note 5: Reserve and Surplus ─────────────────────────────────────────────
  {
    noteNumber: 5,
    title: 'Reserve and Surplus',
    scheduleCode: 'SCH_05',
    statementCode: 'BS',
    calculationMethod: 'RESERVE_SURPLUS',
    calculatorKey: 'ReserveAndSurplusCalculator',
    displayOrder: 20,
    footnotes: [],
    lineItems: [
      {
        lineId: 'n5-a',
        lineLabel: 'a) Investment Subsidy',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_A'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
      },
      {
        lineId: 'n5-b',
        lineLabel: 'b) Land Development Fund',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_B'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 0,
      },
      {
        lineId: 'n5-c',
        lineLabel: 'c) Equipment Creation Fund',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_C'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 3,
        depth: 0,
      },
      {
        lineId: 'n5-d',
        lineLabel: 'd) Working Capital Reserve',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_D'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 4,
        depth: 0,
      },
      {
        lineId: 'n5-e',
        lineLabel: 'e) Grant Received for Convention Centre *',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_E'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 5,
        depth: 0,
        footnote: '*',
      },
      {
        lineId: 'n5-f',
        lineLabel: 'f) Grant/Donation for Ashram, Research & Skill Development',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_F'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 6,
        depth: 0,
      },
      {
        lineId: 'n5-g',
        lineLabel: 'g) Grant/Donation for Other Construction/Projects ',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_G'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 7,
        depth: 0,
      },
      {
        lineId: 'n5-h',
        lineLabel: 'h) ACCDS Project assistance',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_H'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 8,
        depth: 0,
      },
      {
        lineId: 'n5-i',
        lineLabel: 'i) Live Stock Reserve',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_I'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 9,
        depth: 0,
      },
      {
        lineId: 'n5-j',
        lineLabel: 'j) Loose Gold/ Silver Reserve #',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_J'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 10,
        depth: 0,
        footnote: '#',
      },
      {
        lineId: 'n5-k',
        lineLabel: 'k) Surplus (Deficit)%',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_05_K'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 11,
        depth: 0,
        footnote: '%',
      },
      {
        lineId: 'n5-tot',
        lineLabel: 'Total',
        lineType: 'TOTAL',
        sourceNodeCodes: [],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 12,
        depth: 0,
      },
    ],
  },

  // ── Note 6: Secured Loans ───────────────────────────────────────────────────
  {
    noteNumber: 6,
    title: 'Secured Loans ',
    scheduleCode: 'SCH_06',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 30,
    footnotes: [
      '( Refer foot notes for the security given to the lenders)',
      'Foot Note : The disclosure of security against secured loan is given below;',
    ],
    lineItems: [
      {
        lineId: 'n6-nc-hdr',
        lineLabel: 'Non-Current',
        lineType: 'HEADER',
        sourceNodeCodes: [],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
      },
      {
        lineId: 'n6-nc-tb',
        lineLabel: 'Term Loans from Banks',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_06_NC_TB'],
        parentNodeCode: 'N_06_NC_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 1,
      },
      {
        lineId: 'n6-nc-wc',
        lineLabel: 'Working Capital Loans from Banks',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_06_NC_WC'],
        parentNodeCode: 'N_06_NC_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 3,
        depth: 1,
      },
      {
        lineId: 'n6-c-hdr',
        lineLabel: 'Current',
        lineType: 'HEADER',
        sourceNodeCodes: [],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 4,
        depth: 0,
      },
      {
        lineId: 'n6-c-nbfc',
        lineLabel: 'Term Loans from Non Banking Finance Company and Others',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_06_C_NBFC'],
        parentNodeCode: 'N_06_C_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 5,
        depth: 1,
      },
      {
        lineId: 'n6-c-wc',
        lineLabel: 'Working Capital Loans from Banks',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_06_C_WC'],
        parentNodeCode: 'N_06_C_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 6,
        depth: 1,
      },
      {
        lineId: 'n6-tot',
        lineLabel: 'Total',
        lineType: 'TOTAL',
        sourceNodeCodes: ['N_06_NC_TB', 'N_06_NC_WC', 'N_06_C_NBFC', 'N_06_C_WC'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 7,
        depth: 0,
      },
    ],
  },

  // ── Note 7: Unsecured Loans ─────────────────────────────────────────────────
  {
    noteNumber: 7,
    title: 'Unsecured Loans',
    scheduleCode: 'SCH_07',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 40,
    footnotes: ['* Refer Note 3.6'],
    lineItems: [
      {
        lineId: 'n7-dev',
        lineLabel: 'Temporary returnable assistance from devotees*',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_07_DEV'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
        footnote: '* Refer Note 3.6',
      },
      {
        lineId: 'n7-tot',
        lineLabel: 'Total',
        lineType: 'TOTAL',
        sourceNodeCodes: ['N_07_DEV'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 0,
      },
    ],
  },

  // ── Note 8: Sundry Creditors ────────────────────────────────────────────────
  {
    noteNumber: 8,
    title: 'Sundry Creditors',
    scheduleCode: 'SCH_08',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 50,
    footnotes: ['(Refer Foot Notes)', 'Foot Notes :'],
    lineItems: [
      {
        lineId: 'n8-tp',
        lineLabel: 'Trade Payables #',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_08_TP'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
        footnote: '#',
      },
      {
        lineId: 'n8-oc',
        lineLabel: 'Other Creditors #',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_08_OC'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 0,
        footnote: '#',
      },
      {
        lineId: 'n8-tot',
        lineLabel: 'Total',
        lineType: 'TOTAL',
        sourceNodeCodes: ['N_08_TP', 'N_08_OC'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 3,
        depth: 0,
      },
    ],
  },

  // ── Note 9: Other Current liabilities* ──────────────────────────────────────
  {
    noteNumber: 9,
    title: 'Other Current liabilities*',
    scheduleCode: 'SCH_09',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 60,
    footnotes: ['* Refer Note 3.6 in reference of above figure'],
    lineItems: [
      {
        lineId: 'n9-ugc',
        lineLabel: 'Unspend Grand-Capital Item',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_09_UGC'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
      },
      {
        lineId: 'n9-ugr',
        lineLabel: 'Unspend Grant-Revenue nature',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_09_UGR'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 0,
      },
      {
        lineId: 'n9-ugk',
        lineLabel: 'Unspend grand capital nature',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_09_UGK'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 3,
        depth: 0,
      },
      {
        lineId: 'n9-adv',
        lineLabel: 'Advance Received  from Customers/ students/ Patients',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_09_ADV'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 4,
        depth: 0,
      },
      {
        lineId: 'n9-caut',
        lineLabel: 'Caution Deposit',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_09_CAUT'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 5,
        depth: 0,
      },
      {
        lineId: 'n9-oth',
        lineLabel: 'Others',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_09_OTH'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 6,
        depth: 0,
      },
      {
        lineId: 'n9-tot',
        lineLabel: 'Total',
        lineType: 'TOTAL',
        sourceNodeCodes: ['N_09_UGC', 'N_09_UGR', 'N_09_UGK', 'N_09_ADV', 'N_09_CAUT', 'N_09_OTH'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 7,
        depth: 0,
      },
    ],
  },

  // ── Note 10: Short Term Liabilities and Provisions ──────────────────────────
  {
    noteNumber: 10,
    title: 'Short Term Liabilities and Provisions',
    scheduleCode: 'SCH_10',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 70,
    footnotes: [],
    lineItems: [
      {
        lineId: 'n10-a-hdr',
        lineLabel: 'a) Short Term Liabilities',
        lineType: 'HEADER',
        sourceNodeCodes: [],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 1,
        depth: 0,
      },
      {
        lineId: 'n10-a-sal',
        lineLabel: 'Salary payables',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_10_A_SAL'],
        parentNodeCode: 'N_10_A_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 2,
        depth: 1,
      },
      {
        lineId: 'n10-a-fee',
        lineLabel: 'Fees in Advance',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_10_A_FEE'],
        parentNodeCode: 'N_10_A_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 3,
        depth: 1,
      },
      {
        lineId: 'n10-a-ret',
        lineLabel: 'Retention against bills',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_10_A_RET'],
        parentNodeCode: 'N_10_A_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 4,
        depth: 1,
      },
      {
        lineId: 'n10-a-stat',
        lineLabel: 'Other liabilities including statutory liabilities',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_10_A_STAT'],
        parentNodeCode: 'N_10_A_HDR',
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 5,
        depth: 1,
      },
      {
        lineId: 'n10-b-hdr',
        lineLabel: 'b) Provisions for Expense',
        lineType: 'LINE_ITEM',
        sourceNodeCodes: ['N_10_B_HDR'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 6,
        depth: 0,
      },
      {
        lineId: 'n10-tot',
        lineLabel: 'Total',
        lineType: 'TOTAL',
        sourceNodeCodes: ['N_10_A_SAL', 'N_10_A_FEE', 'N_10_A_RET', 'N_10_A_STAT', 'N_10_B_HDR'],
        disclosureRule: 'SHOW_ALWAYS',
        displayOrder: 7,
        depth: 0,
      },
    ],
  },

  // ── Note 11: Tangible Assets ────────────────────────────────────────────────
  {
    noteNumber: 11,
    title: 'Tangible Assets',
    scheduleCode: 'SCH_11',
    statementCode: 'BS',
    calculationMethod: 'TANGIBLE_ASSETS',
    calculatorKey: 'TangibleAssetsCalculator',
    displayOrder: 80,
    footnotes: ['Foot Note :'],
    lineItems: [
      { lineId: 'n11-land-fh', lineLabel: 'Free hold Land-(Foot Note 1)', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_LAND_FH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0, footnote: '(Foot Note 1)' },
      { lineId: 'n11-land-lh', lineLabel: 'Lease hold Land', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_LAND_LH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n11-guru', lineLabel: 'Gururoopam', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_GURU'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n11-gold', lineLabel: 'Loose Gold/ Silver, diamond, stones * (refer Note 3.10)', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_GOLD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0, footnote: '* (refer Note 3.10)' },
      { lineId: 'n11-bld-ch', lineLabel: 'Community and other Charitable Building', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_BLD_CH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n11-bld-och', lineLabel: 'Other than Charitable Building-(Foot Note 2)', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_BLD_OCH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0, footnote: '-(Foot Note 2)' },
      { lineId: 'n11-sci-bld', lineLabel: 'Scientific R & D Building', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_SCI_BLD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
      { lineId: 'n11-sci-eq', lineLabel: 'Scientific R & D Equipments', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_SCI_EQ'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 8, depth: 0 },
      { lineId: 'n11-sci-oth', lineLabel: 'Scientific R & D Other assets', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_SCI_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 9, depth: 0 },
      { lineId: 'n11-soc-bld', lineLabel: 'Social Research Building', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_SOC_BLD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 10, depth: 0 },
      { lineId: 'n11-soc-oth', lineLabel: 'Social Research Other Assets', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_SOC_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 11, depth: 0 },
      { lineId: 'n11-plant', lineLabel: 'Plant & Machinery,Tools & Equipments', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_PLANT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 12, depth: 0 },
      { lineId: 'n11-office', lineLabel: 'Office Equipment', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_OFFICE'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 13, depth: 0 },
      { lineId: 'n11-comp', lineLabel: 'Computer', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_COMP'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 14, depth: 0 },
      { lineId: 'n11-veh', lineLabel: 'Vehicles', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_VEH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 15, depth: 0 },
      { lineId: 'n11-furn', lineLabel: 'Furniture and Fixtures', lineType: 'SUB_SCHEDULE', sourceNodeCodes: ['N_11_FURN'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 16, depth: 0 },
      { lineId: 'n11-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_11_TOT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 17, depth: 0 },
    ],
  },

  // ── Note 12: Capital Work in Progress ───────────────────────────────────────
  {
    noteNumber: 12,
    title: 'Capital Work in Progress',
    scheduleCode: 'SCH_12',
    statementCode: 'BS',
    calculationMethod: 'CWIP',
    calculatorKey: 'CWIPCalculator',
    displayOrder: 90,
    footnotes: [],
    lineItems: [
      { lineId: 'n12-bld-ch', lineLabel: 'Community and other Charitable Building', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_BLD_CH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n12-sci-bld', lineLabel: 'Scientific R & D Building', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_SCI_BLD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n12-conv', lineLabel: 'Convention Centre', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_CONV'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n12-coir', lineLabel: 'Koottukudumba Coir (ACCDS Project)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_COIR'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n12-stp', lineLabel: 'STP and Sub-Station Unit', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_STP'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n12-schl', lineLabel: 'School and College Building', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_SCHL'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
      { lineId: 'n12-oth', lineLabel: 'Other Building and Facilities', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_12_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
      { lineId: 'n12-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 8, depth: 0 },
    ],
  },

  // ── Note 13: Live stock ─────────────────────────────────────────────────────
  {
    noteNumber: 13,
    title: 'Live stock',
    scheduleCode: 'SCH_13',
    statementCode: 'BS',
    calculationMethod: 'LIVE_STOCK',
    calculatorKey: 'LiveStockCalculator',
    displayOrder: 100,
    footnotes: [],
    lineItems: [
      { lineId: 'n13-cows', lineLabel: 'Cows#', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_13_COWS'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0, footnote: '#' },
      { lineId: 'n13-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_13_COWS'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
    ],
  },

  // ── Note 14: Trade Receivable ───────────────────────────────────────────────
  {
    noteNumber: 14,
    title: 'Trade Receivable',
    scheduleCode: 'SCH_14',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 110,
    footnotes: ['Trade Receivable - (Refer foot note)', 'Foot Notes :'],
    lineItems: [
      { lineId: 'n14-sec', lineLabel: 'Secured,Considred Good', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_14_SEC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n14-unsec', lineLabel: 'Unsecured, Considred Good', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_14_UNSEC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n14-dbt', lineLabel: 'Doubt full', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_14_DBT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n14-prov', lineLabel: 'Less:- Provision for doubtful trade Receivable', lineType: 'DEDUCTION', sourceNodeCodes: ['N_14_PROV'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n14-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_14_SEC', 'N_14_UNSEC', 'N_14_DBT', 'N_14_PROV'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
    ],
  },

  // ── Note 15: Cash and bank balances ─────────────────────────────────────────
  {
    noteNumber: 15,
    title: 'Cash and bank balances',
    scheduleCode: 'SCH_15',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 120,
    footnotes: ['Foot Notes :'],
    lineItems: [
      { lineId: 'n15-cce-hdr', lineLabel: 'Cash and cash equivalents', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n15-cash', lineLabel: 'Cash on hand (Verified and Certified by Management)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_15_CASH'], parentNodeCode: 'N_15_CCE_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 1 },
      { lineId: 'n15-bwb-hdr', lineLabel: 'Balances with banks', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n15-chq', lineLabel: '- Cheques in Hand', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_15_CHQ'], parentNodeCode: 'N_15_BWB_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 1 },
      { lineId: 'n15-curr', lineLabel: '- in Current accounts - (Foot Note i,ii)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_15_CURR'], parentNodeCode: 'N_15_BWB_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 1, footnote: '(Foot Note i,ii)' },
      { lineId: 'n15-sav', lineLabel: '- in Saving accounts', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_15_SAV'], parentNodeCode: 'N_15_BWB_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 1 },
      { lineId: 'n15-dep-st', lineLabel: '- Other bank balance (Deposits maturing < 3 months)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_15_DEP_ST'], parentNodeCode: 'N_15_BWB_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 1 },
      { lineId: 'n15-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_15_CASH', 'N_15_CHQ', 'N_15_CURR', 'N_15_SAV', 'N_15_DEP_ST'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 8, depth: 0 },
    ],
  },

  // ── Note 16: Investments ────────────────────────────────────────────────────
  {
    noteNumber: 16,
    title: 'Investments',
    scheduleCode: 'SCH_16',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 130,
    footnotes: [],
    lineItems: [
      { lineId: 'n16-fd-lt', lineLabel: '- Fixed Deposit - (Foot Note ii,iii) (Deposits maturing above 12 months)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_16_FD_LT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0, footnote: '(Foot Note ii,iii)' },
      { lineId: 'n16-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_16_FD_LT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
    ],
  },

  // ── Note 17: Inventories ────────────────────────────────────────────────────
  {
    noteNumber: 17,
    title: 'Inventories',
    scheduleCode: 'SCH_17',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 140,
    footnotes: ['(Verified and Certified by Management)', '*Refer Note no 3.9'],
    lineItems: [
      { lineId: 'n17-rm', lineLabel: 'Raw Material*', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_17_RM'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0, footnote: '*' },
      { lineId: 'n17-wip', lineLabel: 'Work in Process*', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_17_WIP'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0, footnote: '*' },
      { lineId: 'n17-fg', lineLabel: 'Finished Goods*', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_17_FG'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0, footnote: '*' },
      { lineId: 'n17-trade', lineLabel: 'Trading Items*', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_17_TRADE'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0, footnote: '*' },
      { lineId: 'n17-oth', lineLabel: 'Other than Manufacturing & Trading Units', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_17_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n17-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_17_RM', 'N_17_WIP', 'N_17_FG', 'N_17_TRADE', 'N_17_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
    ],
  },

  // ── Note 18: Short term loans and advances* ─────────────────────────────────
  {
    noteNumber: 18,
    title: 'Short term loans and advances*',
    scheduleCode: 'SCH_18',
    statementCode: 'BS',
    calculationMethod: 'LOANS_ADVANCES',
    calculatorKey: 'LoansAndAdvancesCalculator',
    displayOrder: 150,
    footnotes: ['(Unsecured ,Considered Good)', '*Refer note no 3.6'],
    lineItems: [
      { lineId: 'n18-emp', lineLabel: '.Loans and advances to employees', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_18_EMP'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n18-sd-hdr', lineLabel: 'Security deposits', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n18-sd-c', lineLabel: 'Current', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_18_SD_C'], parentNodeCode: 'N_18_SD_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 1 },
      { lineId: 'n18-sd-nc', lineLabel: 'Non- Current', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_18_SD_NC'], parentNodeCode: 'N_18_SD_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 1 },
      { lineId: 'n18-oth-hdr', lineLabel: 'Other loans and advances or recoverable in cash or kind', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n18-oth-c', lineLabel: 'Current', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_18_OTH_C'], parentNodeCode: 'N_18_OTH_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 1 },
      { lineId: 'n18-less-nc', lineLabel: 'Less:Non Current Security deposits', lineType: 'DEDUCTION', sourceNodeCodes: ['N_18_LESS_NC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
      { lineId: 'n18-net-c', lineLabel: 'Current Portion of Loans & Advances', lineType: 'TOTAL', sourceNodeCodes: ['N_18_NET_C'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 8, depth: 0 },
    ],
  },

  // ── Note 19: Other Current Assets* ──────────────────────────────────────────
  {
    noteNumber: 19,
    title: 'Other Current Assets*',
    scheduleCode: 'SCH_19',
    statementCode: 'BS',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 160,
    footnotes: ['(Unsecured, Considered Good)', '*Refer note no 3.6'],
    lineItems: [
      { lineId: 'n19-tax', lineLabel: 'Advance income tax including TDS', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_19_TAX'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n19-grant', lineLabel: 'Grant Receivable', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_19_GRANT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n19-oth', lineLabel: 'Other Current Assets', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_19_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n19-dep-med', lineLabel: 'Deposits maturing above 3 months but less than 12 months', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_19_DEP_MED'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n19-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_19_TAX', 'N_19_GRANT', 'N_19_OTH', 'N_19_DEP_MED'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
    ],
  },

  // ── Note 20: Donations and Grant in Aid ─────────────────────────────────────
  {
    noteNumber: 20,
    title: 'Donations and Grant in Aid',
    scheduleCode: 'SCH_20',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 200,
    footnotes: [],
    lineItems: [
      { lineId: 'n20-don', lineLabel: 'Donations', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_20_DON'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n20-kind', lineLabel: 'Donation Received in kind', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_20_KIND'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n20-grant', lineLabel: 'Grants in Aid', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_20_GRANT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n20-oth', lineLabel: 'Other Collections', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_20_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n20-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_20_DON', 'N_20_KIND', 'N_20_GRANT', 'N_20_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
    ],
  },

  // ── Note 21: Donations for Scientific and Industrial, Social Research ────────
  {
    noteNumber: 21,
    title: 'Donations for Scientific and Industrial, Social Research',
    scheduleCode: 'SCH_21',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 210,
    footnotes: [],
    lineItems: [
      { lineId: 'n21-sci', lineLabel: 'Donation/ Grant in Aid for Scientific and Industrial Research', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_21_SCI'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n21-soc', lineLabel: 'Donation/ Grant in Aid for Social Research', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_21_SOC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n21-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_21_SCI', 'N_21_SOC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
    ],
  },

  // ── Note 22: Revenue from operations ────────────────────────────────────────
  {
    noteNumber: 22,
    title: 'Revenue from operations',
    scheduleCode: 'SCH_22',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 220,
    footnotes: [],
    lineItems: [
      { lineId: 'n22-sal-ker', lineLabel: 'Sales at Kerala (Note 3.16)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_22_SAL_KER'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0, footnote: '(Note 3.16)' },
      { lineId: 'n22-sal-out', lineLabel: 'Sales Outside Kerala (Note 3.16)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_22_SAL_OUT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0, footnote: '(Note 3.16)' },
      { lineId: 'n22-edu', lineLabel: 'Income from Educational Activity', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_22_EDU'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n22-hlth', lineLabel: 'Income from Healthcare Activity', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_22_HLTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n22-oth', lineLabel: 'Revenue from Other Operations', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_22_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n22-disc', lineLabel: 'Discounts and Rebates', lineType: 'DEDUCTION', sourceNodeCodes: ['N_22_DISC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
      { lineId: 'n22-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_22_SAL_KER', 'N_22_SAL_OUT', 'N_22_EDU', 'N_22_HLTH', 'N_22_OTH', 'N_22_DISC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
    ],
  },

  // ── Note 23: Agriculture, Dairy Income ──────────────────────────────────────
  {
    noteNumber: 23,
    title: 'Agriculture, Dairy Income',
    scheduleCode: 'SCH_23',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 230,
    footnotes: [],
    lineItems: [
      { lineId: 'n23-agri', lineLabel: 'Agriculture Income', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_23_AGRI'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n23-dairy', lineLabel: 'Dairy Income', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_23_DAIRY'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n23-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_23_AGRI', 'N_23_DAIRY'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
    ],
  },

  // ── Note 24: Other income ───────────────────────────────────────────────────
  {
    noteNumber: 24,
    title: 'Other income',
    scheduleCode: 'SCH_24',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 240,
    footnotes: [],
    lineItems: [
      { lineId: 'n24-int', lineLabel: 'Interest Income', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_24_INT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n24-dd', lineLabel: 'Duty Drawback Received', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_24_DD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n24-misc', lineLabel: 'Mise Income/Research service', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_24_MISC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n24-fa-prof', lineLabel: 'Profit on Sale of Other Fixed Asset (Net)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_24_FA_PROF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n24-lnd-prof', lineLabel: 'Profit on Sale of Land & Building (Net)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_24_LND_PROF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n24-veh-prof', lineLabel: 'Profit(Loss) on Sale of Vehicle (Net)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_24_VEH_PROF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
      { lineId: 'n24-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_24_INT', 'N_24_DD', 'N_24_MISC', 'N_24_FA_PROF', 'N_24_LND_PROF', 'N_24_VEH_PROF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
    ],
  },

  // ── Note 25: Increase ( Decrease) in Finished Goods, Manufacturing Items & WIP ─
  {
    noteNumber: 25,
    title: 'Increase ( Decrease) in Finished Goods, Manufacturing Items & WIP',
    scheduleCode: 'SCH_25',
    statementCode: 'IE',
    calculationMethod: 'STOCK_MOVEMENT',
    calculatorKey: 'StockMovementCalculator',
    displayOrder: 250,
    footnotes: [],
    lineItems: [
      { lineId: 'n25-cl-hdr', lineLabel: 'Closing Stock', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n25-cl-mfg', lineLabel: 'Manufacturing Units', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_25_CL_MFG'], parentNodeCode: 'N_25_CL_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 1 },
      { lineId: 'n25-cl-wip', lineLabel: 'WIP', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_25_CL_WIP'], parentNodeCode: 'N_25_CL_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 1 },
      { lineId: 'n25-cl-oth', lineLabel: 'Other than Manufacturing & Trading Units', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_25_CL_OTH'], parentNodeCode: 'N_25_CL_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 1 },
      { lineId: 'n25-cl-tot', lineLabel: 'Total', lineType: 'SUBTOTAL', sourceNodeCodes: ['N_25_CL_TOT'], parentNodeCode: 'N_25_CL_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 1 },
      { lineId: 'n25-op-hdr', lineLabel: 'Opening Stock', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
      { lineId: 'n25-op-mfg', lineLabel: 'Manufacturing Units', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_25_OP_MFG'], parentNodeCode: 'N_25_OP_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 1 },
      { lineId: 'n25-op-wip', lineLabel: 'WIP', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_25_OP_WIP'], parentNodeCode: 'N_25_OP_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 8, depth: 1 },
      { lineId: 'n25-op-oth', lineLabel: 'Other than Manufacturing & Trading Units', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_25_OP_OTH'], parentNodeCode: 'N_25_OP_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 9, depth: 1 },
      { lineId: 'n25-op-tot', lineLabel: 'Total', lineType: 'SUBTOTAL', sourceNodeCodes: ['N_25_OP_TOT'], parentNodeCode: 'N_25_OP_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 10, depth: 1 },
      { lineId: 'n25-net-tot', lineLabel: 'Increase (Decrease)', lineType: 'TOTAL', sourceNodeCodes: ['N_25_NET_TOT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 11, depth: 0 },
    ],
  },

  // ── Note 26: Community Welfare, Charitable Application ──────────────────────
  {
    noteNumber: 26,
    title: 'Community Welfare, Charitable Application',
    scheduleCode: 'SCH_26',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 260,
    footnotes: [],
    lineItems: [
      { lineId: 'n26-edu', lineLabel: 'Free Education to Poor and deserving Students', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_26_EDU'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n26-food', lineLabel: 'Free Food (Annadanam)', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_26_FOOD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n26-med', lineLabel: 'Free Medicines & Treatment Expense to needy', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_26_MED'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n26-oth-asst', lineLabel: 'Other Assistance to Poor / needy', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_26_OTH_ASST'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n26-fest', lineLabel: 'Function & Festival Expenses', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_26_FEST'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n26-adm', lineLabel: 'Other Administrative Expense', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_26_ADM'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
      { lineId: 'n26-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_26_EDU', 'N_26_FOOD', 'N_26_MED', 'N_26_OTH_ASST', 'N_26_FEST', 'N_26_ADM'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
    ],
  },

  // ── Note 27: Application for Social & Scientific Research ───────────────────
  {
    noteNumber: 27,
    title: 'Application for Social & Scientific Research',
    scheduleCode: 'SCH_27',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 270,
    footnotes: [],
    lineItems: [
      { lineId: 'n27-sci', lineLabel: 'For Scientific and Industrial Research', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_27_SCI'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n27-soc', lineLabel: 'For Social Research', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_27_SOC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n27-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_27_SCI', 'N_27_SOC'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
    ],
  },

  // ── Note 28: Consumption of material, stores and others ─────────────────────
  {
    noteNumber: 28,
    title: 'Consumption of material, stores and others',
    scheduleCode: 'SCH_28',
    statementCode: 'IE',
    calculationMethod: 'MATERIAL_CONSUMPTION',
    calculatorKey: 'MaterialConsumptionCalculator',
    displayOrder: 280,
    footnotes: [],
    lineItems: [
      { lineId: 'n28-op-hdr', lineLabel: 'Opening Stock', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n28-op-rm', lineLabel: 'Raw Material', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_28_OP_RM'], parentNodeCode: 'N_28_OP_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 1 },
      { lineId: 'n28-op-tot', lineLabel: 'Total', lineType: 'SUBTOTAL', sourceNodeCodes: ['N_28_OP_TOT'], parentNodeCode: 'N_28_OP_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 1 },
      { lineId: 'n28-pur', lineLabel: 'Add : Purchase', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_28_PUR'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n28-cl-hdr', lineLabel: 'Less: Closing Stock', lineType: 'HEADER', sourceNodeCodes: [], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n28-cl-rm', lineLabel: 'Raw Material', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_28_CL_RM'], parentNodeCode: 'N_28_CL_HDR', disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 1 },
      { lineId: 'n28-cons', lineLabel: 'Consumptions', lineType: 'TOTAL', sourceNodeCodes: ['N_28_CONS'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
    ],
  },

  // ── Note 29: Cost of Trading Items sold ─────────────────────────────────────
  {
    noteNumber: 29,
    title: 'Cost of Trading Items sold',
    scheduleCode: 'SCH_29',
    statementCode: 'IE',
    calculationMethod: 'TRADING_COGS',
    calculatorKey: 'TradingCOGSCalculator',
    displayOrder: 290,
    footnotes: [],
    lineItems: [
      { lineId: 'n29-op-trd', lineLabel: 'Opening Stock', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_29_OP_TRD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n29-pur', lineLabel: 'Add : Purchase', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_29_PUR'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n29-cl-trd', lineLabel: 'Less: Closing Stock', lineType: 'DEDUCTION', sourceNodeCodes: ['N_29_CL_TRD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n29-cogs', lineLabel: 'Cost of Trading Items sold', lineType: 'TOTAL', sourceNodeCodes: ['N_29_COGS'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
    ],
  },

  // ── Note 30: Agriculture, Dairy Expense ─────────────────────────────────────
  {
    noteNumber: 30,
    title: 'Agriculture, Dairy Expense',
    scheduleCode: 'SCH_30',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 300,
    footnotes: [],
    lineItems: [
      { lineId: 'n30-agri', lineLabel: 'Other Agricultural Expenses', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_30_AGRI'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n30-cat-med', lineLabel: 'Medical expense for Cattle', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_30_CAT_MED'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n30-cat-feed', lineLabel: 'Feeds for Cattle', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_30_CAT_FEED'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n30-dairy-oth', lineLabel: 'Other Dairy Expenses', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_30_DAIRY_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n30-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_30_AGRI', 'N_30_CAT_MED', 'N_30_CAT_FEED', 'N_30_DAIRY_OTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
    ],
  },

  // ── Note 31: Employee benefits expenses ─────────────────────────────────────
  {
    noteNumber: 31,
    title: 'Employee benefits expenses',
    scheduleCode: 'SCH_31',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 310,
    footnotes: [],
    lineItems: [
      { lineId: 'n31-sal', lineLabel: 'Salaries', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_31_SAL'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n31-lwf', lineLabel: 'Contribution to labour welfare fund', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_31_LWF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n31-welf', lineLabel: 'Staff  Medical & welfare expenses', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_31_WELF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n31-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_31_SAL', 'N_31_LWF', 'N_31_WELF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
    ],
  },

  // ── Note 32: Finance Cost ───────────────────────────────────────────────────
  {
    noteNumber: 32,
    title: 'Finance Cost',
    scheduleCode: 'SCH_32',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 320,
    footnotes: [],
    lineItems: [
      { lineId: 'n32-int-borr', lineLabel: 'Interest on borrowings', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_32_INT_BORR'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n32-int-stat', lineLabel: 'Interest on statutory dues', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_32_INT_STAT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n32-bank-chg', lineLabel: 'Bank charges', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_32_BANK_CHG'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n32-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: ['N_32_INT_BORR', 'N_32_INT_STAT', 'N_32_BANK_CHG'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
    ],
  },

  // ── Note 33: Administrative and Other expenses ──────────────────────────────
  {
    noteNumber: 33,
    title: 'Administrative and Other expenses',
    scheduleCode: 'SCH_33',
    statementCode: 'IE',
    calculationMethod: 'NODE_BALANCE',
    displayOrder: 330,
    footnotes: [],
    lineItems: [
      { lineId: 'n33-rent', lineLabel: 'Rent', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_RENT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 1, depth: 0 },
      { lineId: 'n33-rep', lineLabel: 'Repairs & Maintenance', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_REP'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 2, depth: 0 },
      { lineId: 'n33-tax', lineLabel: 'Rates & taxes', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_TAX'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 3, depth: 0 },
      { lineId: 'n33-power', lineLabel: 'Power & fuel', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_POWER'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 4, depth: 0 },
      { lineId: 'n33-prof', lineLabel: 'Professional Charges', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_PROF'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 5, depth: 0 },
      { lineId: 'n33-adm', lineLabel: 'Administration expense', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_ADM'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 6, depth: 0 },
      { lineId: 'n33-comm', lineLabel: 'Communication expense', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_COMM'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 7, depth: 0 },
      { lineId: 'n33-ins', lineLabel: 'Insurance expense', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_INS'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 8, depth: 0 },
      { lineId: 'n33-trav', lineLabel: 'Travelling & conveyance', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_TRAV'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 9, depth: 0 },
      { lineId: 'n33-veh', lineLabel: 'Vehicle Running & Maintenance', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_VEH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 10, depth: 0 },
      { lineId: 'n33-prom', lineLabel: 'Business promotion expenses', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_PROM'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 11, depth: 0 },
      { lineId: 'n33-stat', lineLabel: 'Printing & stationery', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_STAT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 12, depth: 0 },
      { lineId: 'n33-audit', lineLabel: 'Auditors Remuneration', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_AUDIT'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 13, depth: 0 },
      { lineId: 'n33-bad', lineLabel: 'Bad Debts Written Off', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_BAD'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 14, depth: 0 },
      { lineId: 'n33-fine', lineLabel: 'Fine & Penalty', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_FINE'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 15, depth: 0 },
      { lineId: 'n33-edu', lineLabel: 'Expense for Educational Activity', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_EDU'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 16, depth: 0 },
      { lineId: 'n33-hlth', lineLabel: 'Expense for Healthcare Activity', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_HLTH'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 17, depth: 0 },
      { lineId: 'n33-trade', lineLabel: 'Trading and other charges', lineType: 'LINE_ITEM', sourceNodeCodes: ['N_33_TRADE'], disclosureRule: 'SHOW_ALWAYS', displayOrder: 18, depth: 0 },
      { lineId: 'n33-tot', lineLabel: 'Total', lineType: 'TOTAL', sourceNodeCodes: [
        'N_33_RENT', 'N_33_REP', 'N_33_TAX', 'N_33_POWER', 'N_33_PROF', 'N_33_ADM',
        'N_33_COMM', 'N_33_INS', 'N_33_TRAV', 'N_33_VEH', 'N_33_PROM', 'N_33_STAT',
        'N_33_AUDIT', 'N_33_BAD', 'N_33_FINE', 'N_33_EDU', 'N_33_HLTH', 'N_33_TRADE'
      ], disclosureRule: 'SHOW_ALWAYS', displayOrder: 19, depth: 0 },
    ],
  },
];
