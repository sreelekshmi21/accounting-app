import Database from 'better-sqlite3';
import * as path from 'node:path';
import { generateFinancialStatements } from './financial-statement-engine';
import { runFinalValidation } from './final-validation-engine';

const baseDir = process.env.APPDATA || '';
const dbPath = path.join(baseDir, 'accounting-app', 'accounting.db');
const db = new Database(dbPath);

const fy2526 = db.prepare("SELECT * FROM FinancialYear WHERE year_label = '2025-26'").get() as any;
const maBakery = db.prepare("SELECT * FROM Unit WHERE unit_name LIKE '%Ma Bakery%'").get() as any;

console.log('=== TEST EXECUTIVE SUMMARY COMPILATION ===\n');

function getExecutiveSummary(db: Database.Database, fyId: string, options?: any) {
  const fs = generateFinancialStatements(db, fyId, options);
  const val = runFinalValidation(db, fyId, options);

  // Extract Balance Sheet lines
  const lines = fs.balanceSheet.lines;
  const findLine = (noteNum: number) => lines.find((l) => l.sourceNoteNumber === noteNum);

  const note4 = findLine(4);
  const note5 = findLine(5);
  const note6 = findLine(6);
  const note7 = findLine(7);
  const note8 = findLine(8);
  const note9 = findLine(9);
  const note10 = findLine(10);
  const note11 = findLine(11);
  const note14 = findLine(14);
  const note15 = findLine(15);
  const note17 = findLine(17);
  const note18 = findLine(18);
  const note19 = findLine(19);
  const note20 = findLine(20);
  const note21 = findLine(21);
  const note22 = findLine(22);

  const corpusReservesCY = (note4?.cyAmount || 0) + (note5?.cyAmount || 0);
  const loansBorrowingsCY = (note6?.cyAmount || 0) + (note7?.cyAmount || 0);
  const payablesLiabCY = (note8?.cyAmount || 0) + (note9?.cyAmount || 0) + (note10?.cyAmount || 0);

  const cashBankCY = (note20?.cyAmount !== undefined ? note20.cyAmount : note15?.cyAmount) || 0;
  const investmentsCY = (note14?.cyAmount || 0) + (note17?.cyAmount || 0);
  const inventoryCY = (note18?.cyAmount !== undefined ? note18.cyAmount : note17?.cyAmount) || 0;
  const receivablesCY = (note19?.cyAmount || 0) + (note21?.cyAmount || 0) + (note22?.cyAmount || 0);

  return {
    totalIncome: fs.incomeExpenditure.totalRevenueCY,
    totalExpenditure: fs.incomeExpenditure.totalExpensesCY,
    netSurplusDeficit: fs.incomeExpenditure.netSurplusCY,
    isSurplus: fs.incomeExpenditure.netSurplusCY >= 0,
    totalAssets: fs.balanceSheet.totalAssetsCY,
    totalLiabilities: fs.balanceSheet.totalLiabilitiesCY,
    corpusReserves: corpusReservesCY,
    cashBank: cashBankCY,
    investments: investmentsCY,
    inventory: inventoryCY,
    receivables: receivablesCY,
    loansBorrowings: loansBorrowingsCY,
    payablesLiabilities: payablesLiabCY,
    validationStatus: val.overallStatus,
    valChecks: `${val.summary.passed}/${val.summary.totalChecks} passed`,
  };
}

console.log('--- Ma Bakery ---');
const resMB = getExecutiveSummary(db, fy2526.id, { scope: 'UNIT', unitId: maBakery.id });
console.log(resMB);

console.log('\n--- Consolidated ---');
const resConsolidated = getExecutiveSummary(db, fy2526.id, { scope: 'CONSOLIDATED' });
console.log(resConsolidated);
