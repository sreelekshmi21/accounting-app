#!/usr/bin/env python3
"""
Regression Tests for Tally Trial Balance Import Engine
======================================================
Tests header normalization, header detection across row positions,
financial year parsing (2-digit and 4-digit years), numeric parsing
(including Indian comma grouping), total-row exclusion, and
full end-to-end import for the Ma Bakery sample file.

Run:
    python -m pytest test_tally_import.py -v
"""

import math
import os
import tempfile
from typing import Any, Dict, List, Optional

import openpyxl
import pytest

from tally_import import (
    clean_numeric,
    detect_financial_year,
    detect_header_row,
    import_trial_balance,
    is_grand_total_row,
    normalize_header_text,
)

import pandas as pd


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_excel(rows: List[List[Any]], sheet_name: str = "Sheet1") -> str:
    """Write *rows* to a temporary .xlsx file and return its path."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    for row in rows:
        ws.append(row)
    fd, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    wb.save(path)
    return path


def _raw_df(rows: List[List[Any]]) -> pd.DataFrame:
    """Create a headerless DataFrame from raw row data (in-memory)."""
    return pd.DataFrame(rows)


# ══════════════════════════════════════════════════════════════════════════════
# Section 1: Header Normalization
# ══════════════════════════════════════════════════════════════════════════════


class TestNormalizeHeaderText:
    """normalize_header_text must reduce common Tally header variations
    to their semantic root form so the existing regex patterns can match."""

    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("Particulars", "particulars"),
            ("PARTICULARS", "particulars"),
            ("Particular", "particular"),
            ("  Particulars  ", "particulars"),
        ],
    )
    def test_particulars_variants(self, raw: str, expected: str):
        assert normalize_header_text(raw) == expected

    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("Debit", "debit"),
            ("DEBIT", "debit"),
            ("Debit(Rs)", "debit"),
            ("Debit (Rs.)", "debit"),
            ("Debit Amount", "debit amount"),
            ("Dr", "dr"),
        ],
    )
    def test_debit_variants(self, raw: str, expected: str):
        assert normalize_header_text(raw) == expected

    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("Credit", "credit"),
            ("CREDIT", "credit"),
            ("Credit(Rs)", "credit"),
            ("Credit (Rs.)", "credit"),
            ("Credit Amount", "credit amount"),
            ("Cr", "cr"),
        ],
    )
    def test_credit_variants(self, raw: str, expected: str):
        assert normalize_header_text(raw) == expected

    def test_currency_symbols_removed(self):
        assert normalize_header_text("Debit(₹)") == "debit"
        assert normalize_header_text("Credit($)") == "credit"
        assert normalize_header_text("Credit(€)") == "credit"
        assert normalize_header_text("Debit(£)") == "debit"

    def test_periods_removed(self):
        assert normalize_header_text("Op. Bal.") == "op bal"

    def test_empty_and_whitespace(self):
        assert normalize_header_text("") == ""
        assert normalize_header_text("   ") == ""


# ══════════════════════════════════════════════════════════════════════════════
# Section 2: Header Detection — Various Header Formats
# ══════════════════════════════════════════════════════════════════════════════


class TestHeaderDetection:
    """detect_header_row must identify the header across multiple
    Tally export variations and row positions."""

    def test_standard_headers(self):
        """Particulars | Debit | Credit — standard Tally format."""
        df = _raw_df([["Particulars", "Debit", "Credit"]])
        row, mapping = detect_header_row(df)
        assert row == 0
        assert "ledger_name" in mapping
        assert "debit" in mapping
        assert "credit" in mapping

    def test_rs_suffix_headers(self):
        """Particulars | Debit(Rs) | Credit(Rs) — the failing format."""
        df = _raw_df([["Particulars", "Debit(Rs)", "Credit(Rs)"]])
        row, mapping = detect_header_row(df)
        assert row == 0
        assert "ledger_name" in mapping
        assert "debit" in mapping
        assert "credit" in mapping

    def test_uppercase_headers(self):
        """PARTICULARS | DEBIT | CREDIT"""
        df = _raw_df([["PARTICULARS", "DEBIT", "CREDIT"]])
        row, mapping = detect_header_row(df)
        assert row == 0
        assert "ledger_name" in mapping
        assert "debit" in mapping
        assert "credit" in mapping

    def test_rs_dot_suffix_headers(self):
        """Particular | Debit (Rs.) | Credit (Rs.)"""
        df = _raw_df([["Particular", "Debit (Rs.)", "Credit (Rs.)"]])
        row, mapping = detect_header_row(df)
        assert row == 0
        # "particular" should match the r"particulars" → no, but should match
        # one of the ledger_name patterns.  Let's verify:
        assert "ledger_name" in mapping
        assert "debit" in mapping
        assert "credit" in mapping

    # ── Header position tests ─────────────────────────────────────────────

    def test_header_on_row_1(self):
        """Header is the very first row (index 0)."""
        df = _raw_df([["Particulars", "Debit", "Credit"]])
        row, _ = detect_header_row(df)
        assert row == 0

    def test_header_on_row_2(self):
        """Header is the second row (index 1), preceded by a title."""
        df = _raw_df([
            ["Ma Bakery", None, None],
            ["Particulars", "Debit", "Credit"],
        ])
        row, mapping = detect_header_row(df)
        assert row == 1
        assert "ledger_name" in mapping

    def test_header_on_row_3(self):
        """Header is the third row (index 2), preceded by title + period."""
        df = _raw_df([
            ["Ma Bakery", None, None],
            ["Trial balance 1/4/25 to 31/3/26", None, None],
            ["Particulars", "Debit(Rs)", "Credit(Rs)"],
        ])
        row, mapping = detect_header_row(df)
        assert row == 2
        assert "ledger_name" in mapping
        assert "debit" in mapping
        assert "credit" in mapping

    def test_header_after_multiple_title_rows(self):
        """Header after org name, address, and period rows."""
        df = _raw_df([
            ["Ma Bakery", None, None],
            ["123 Main Street", None, None],
            ["Trial balance 1/4/25 to 31/3/26", None, None],
            [None, None, None],  # blank row
            ["Particulars", "Debit(Rs)", "Credit(Rs)"],
        ])
        row, mapping = detect_header_row(df)
        assert row == 4
        assert "debit" in mapping
        assert "credit" in mapping


# ══════════════════════════════════════════════════════════════════════════════
# Section 3: Numeric Parsing — Indian Comma Grouping
# ══════════════════════════════════════════════════════════════════════════════


class TestNumericParsing:
    """clean_numeric must correctly parse Indian-style comma formatting."""

    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("28,000.00", 28000.00),
            ("7,777.42", 7777.42),
            ("2,02,998.93", 202998.93),
            ("3,14,814.62", 314814.62),
            ("10,419.00", 10419.00),
            ("92,162.71", 92162.71),
            # Standard Western grouping
            ("1,234,567.89", 1234567.89),
            # Already numeric
            (28000.0, 28000.0),
            (0, 0.0),
            # Empty/null
            (None, None),
            ("", None),
            ("-", None),
            (float("nan"), None),
        ],
    )
    def test_clean_numeric(self, raw: Any, expected: Optional[float]):
        result = clean_numeric(raw)
        if expected is None:
            assert result is None
        else:
            assert result == pytest.approx(expected)


# ══════════════════════════════════════════════════════════════════════════════
# Section 4: Total Row Detection
# ══════════════════════════════════════════════════════════════════════════════


class TestTotalRowDetection:
    """is_grand_total_row must catch all common total-row labels."""

    @pytest.mark.parametrize(
        "label",
        [
            "Total",
            "total",
            "TOTAL",
            "Grand Total",
            "grand total",
            "Grand Total:",
            "Nett Total",
            "Net Total",
            "Closing Total",
            "Sub Total",
            "Subtotal",
            "Grand Total (All Groups)",
        ],
    )
    def test_total_labels_detected(self, label: str):
        assert is_grand_total_row(label), f"'{label}' should be detected as a total row"

    @pytest.mark.parametrize(
        "label",
        [
            "Sales",
            "Total Assets Under Management",  # does not start with grand total
            "Purchases",
            "Branch / Divisions",
            "",
        ],
    )
    def test_non_total_labels(self, label: str):
        assert not is_grand_total_row(label), f"'{label}' should NOT be detected as a total row"


# ══════════════════════════════════════════════════════════════════════════════
# Section 5: Financial Year Detection
# ══════════════════════════════════════════════════════════════════════════════


class TestFinancialYearDetection:
    """Ensure both 2-digit-year numeric dates and existing 4-digit/month-name
    formats are parsed correctly."""

    def _fy_from_rows(self, rows: List[List[Any]], header_row: int = 0) -> Dict:
        df = _raw_df(rows)
        return detect_financial_year(df, "Sheet1", header_row)

    def test_2digit_year_numeric(self):
        """1/4/25 to 31/3/26 → FY 2025-26"""
        fy = self._fy_from_rows(
            [["Trial balance 1/4/25 to 31/3/26"]],
            header_row=1,
        )
        assert fy["financial_year"] is not None
        # Python %y interprets 25 as 2025, 26 as 2026
        assert "2025" in fy["financial_year"]
        assert "2026" in fy["financial_year"]

    def test_4digit_year_numeric(self):
        """01-04-2024 to 31-03-2025 → FY 2024-2025"""
        fy = self._fy_from_rows(
            [["Trial balance 01-04-2024 to 31-03-2025"]],
            header_row=1,
        )
        assert fy["financial_year"] is not None
        assert "2024" in fy["financial_year"]
        assert "2025" in fy["financial_year"]

    def test_month_name_format(self):
        """1-Apr-2024 to 31-Mar-2025 → FY 2024-2025"""
        fy = self._fy_from_rows(
            [["1-Apr-2024 to 31-Mar-2025"]],
            header_row=1,
        )
        assert fy["financial_year"] is not None
        assert "2024" in fy["financial_year"]
        assert "2025" in fy["financial_year"]

    def test_fy_shorthand(self):
        """2024-25 in sheet name or header → FY 2024-2025"""
        df = _raw_df([["Some header"]])
        fy = detect_financial_year(df, "Trial Balance 2024-25", header_row=0)
        assert fy["financial_year"] is not None
        assert "2024" in fy["financial_year"]

    def test_existing_tally_format_preserved(self):
        """Full month-name date range with slash separators."""
        fy = self._fy_from_rows(
            [["Trial balance 1/Apr/2024 to 31/Mar/2025"]],
            header_row=1,
        )
        assert fy["financial_year"] is not None
        assert "2024" in fy["financial_year"]


# ══════════════════════════════════════════════════════════════════════════════
# Section 6: Blank Row Handling
# ══════════════════════════════════════════════════════════════════════════════


class TestBlankRowHandling:
    """Blank rows between header and data must not cause import failure."""

    def test_blank_rows_between_header_and_data(self):
        path = _make_excel([
            ["Particulars", "Debit", "Credit"],
            [None, None, None],  # blank
            ["Sales", None, 50000],
            [None, None, None],  # blank
            ["Purchases", 30000, None],
        ])
        try:
            result = import_trial_balance(path)
            assert result["success"] is True
            ledger_names = [l["ledger_name"] for l in result["ledgers"]]
            assert "Sales" in ledger_names
            assert "Purchases" in ledger_names
        finally:
            os.unlink(path)


# ══════════════════════════════════════════════════════════════════════════════
# Section 7: Full End-to-End Import — Ma Bakery Sample
# ══════════════════════════════════════════════════════════════════════════════


# The exact ledger set from the user's sample (14 ledgers)
MA_BAKERY_LEDGERS = [
    {"name": "Unsecured Loans",                       "debit": None,      "credit": 28000.00},
    {"name": "Duties & Taxes",                        "debit": 7777.42,   "credit": 10419.00},
    {"name": "Opening Stock",                         "debit": 7256.08,   "credit": None},
    {"name": "Deposits (Asset)",                      "debit": 6734.00,   "credit": None},
    {"name": "Cash-in-hand",                          "debit": 6406.00,   "credit": None},
    {"name": "Fixed Assets",                          "debit": 92162.71,  "credit": None},
    {"name": "Branch / Divisions",                    "debit": 11616.00,  "credit": 73396.69},
    {"name": "Sales",                                 "debit": None,      "credit": 202998.93},
    {"name": "Purchases",                             "debit": 80367.41,  "credit": None},
    {"name": "Electricity & Water Charges (DE)",      "debit": 22105.00,  "credit": None},
    {"name": "Salaries & Allowances",                 "debit": 56864.00,  "credit": None},
    {"name": "Sales Promotion Expenses",              "debit": 11326.00,  "credit": None},
    {"name": "Telephone,Internet & Cable Charges",    "debit": 2064.00,   "credit": None},
    {"name": "Travelling & Conveyance",               "debit": 10136.00,  "credit": None},
]


def _build_ma_bakery_excel() -> str:
    """Create a temporary Excel file that faithfully reproduces the
    Ma Bakery Trial Balance sample from the user's bug report."""
    rows: List[List[Any]] = [
        ["Ma Bakery", None, None],
        ["Trial balance 1/4/25 to 31/3/26", None, None],
        [None, None, None],  # blank row between period and header
        ["Particulars", "Debit(Rs)", "Credit(Rs)"],
    ]
    for entry in MA_BAKERY_LEDGERS:
        rows.append([entry["name"], entry["debit"], entry["credit"]])
    # Total row — must be excluded from ledger import
    rows.append(["Total", 314814.62, 314814.62])
    return _make_excel(rows)


class TestMaBakeryFullImport:
    """End-to-end import of the Ma Bakery sample.  Validates the exact
    ledger set, amounts, financial year, and total-row exclusion."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.path = _build_ma_bakery_excel()
        self.result = import_trial_balance(self.path)
        yield
        os.unlink(self.path)

    def test_import_succeeds(self):
        assert self.result["success"] is True, (
            f"Import failed: {self.result.get('error')}"
        )

    def test_financial_year_detected(self):
        fy = self.result["import_metadata"]["financial_year"]
        assert fy is not None, "Financial year not detected"
        assert "2025" in fy and "2026" in fy, (
            f"Expected FY containing 2025 and 2026, got: {fy}"
        )

    def test_exact_ledger_count(self):
        """All 14 ledgers must be imported — no more, no less."""
        assert len(self.result["ledgers"]) == 14, (
            f"Expected 14 ledgers, got {len(self.result['ledgers'])}. "
            f"Names: {[l['ledger_name'] for l in self.result['ledgers']]}"
        )

    def test_all_expected_ledgers_present(self):
        """Every expected ledger name must appear exactly once."""
        imported_names = [l["ledger_name"] for l in self.result["ledgers"]]
        expected_names = [e["name"] for e in MA_BAKERY_LEDGERS]
        for name in expected_names:
            assert name in imported_names, (
                f"Ledger '{name}' is missing from import. "
                f"Imported: {imported_names}"
            )
        # No unexpected ledgers
        for name in imported_names:
            assert name in expected_names, (
                f"Unexpected ledger '{name}' was imported. "
                f"Expected: {expected_names}"
            )

    def test_no_duplicate_ledgers(self):
        """Each ledger name must appear exactly once."""
        imported_names = [l["ledger_name"] for l in self.result["ledgers"]]
        assert len(imported_names) == len(set(imported_names)), (
            f"Duplicate ledger names found: {imported_names}"
        )

    def test_total_row_excluded(self):
        """The 'Total' row must NOT be in the ledger dataset."""
        imported_names = [l["ledger_name"] for l in self.result["ledgers"]]
        assert "Total" not in imported_names, (
            "'Total' row was imported as a ledger"
        )

    def test_branch_divisions_amounts(self):
        """Branch / Divisions must have correct debit and credit values
        (critical for Phase 9 consolidation / inter-branch elimination)."""
        ledger = next(
            (l for l in self.result["ledgers"]
             if l["ledger_name"] == "Branch / Divisions"),
            None,
        )
        assert ledger is not None, "Branch / Divisions ledger not found"
        assert ledger["debit"] == pytest.approx(11616.00), (
            f"Branch / Divisions debit: expected 11616.00, got {ledger['debit']}"
        )
        assert ledger["credit"] == pytest.approx(73396.69), (
            f"Branch / Divisions credit: expected 73396.69, got {ledger['credit']}"
        )

    def test_all_ledger_amounts_correct(self):
        """Verify debit/credit for every imported ledger."""
        ledger_map = {l["ledger_name"]: l for l in self.result["ledgers"]}
        for expected in MA_BAKERY_LEDGERS:
            ledger = ledger_map[expected["name"]]
            exp_debit = expected["debit"] if expected["debit"] is not None else 0.0
            exp_credit = expected["credit"] if expected["credit"] is not None else 0.0
            assert ledger["debit"] == pytest.approx(exp_debit), (
                f"{expected['name']}: debit expected {exp_debit}, got {ledger['debit']}"
            )
            assert ledger["credit"] == pytest.approx(exp_credit), (
                f"{expected['name']}: credit expected {exp_credit}, got {ledger['credit']}"
            )

    def test_source_totals_balanced(self):
        """Source Debit = Source Credit = ₹314,814.62, Difference = ₹0.00"""
        summary = self.result["summary"]
        assert summary["total_debit"] == pytest.approx(314814.62), (
            f"Total debit: expected 314814.62, got {summary['total_debit']}"
        )
        assert summary["total_credit"] == pytest.approx(314814.62), (
            f"Total credit: expected 314814.62, got {summary['total_credit']}"
        )
        assert summary["difference"] == pytest.approx(0.0, abs=0.01), (
            f"Difference: expected 0.00, got {summary['difference']}"
        )

    def test_grand_total_captured_for_validation(self):
        """The grand total row values should be captured for cross-validation,
        but not added to the ledger list."""
        summary = self.result["summary"]
        assert summary["grand_total_debit"] == pytest.approx(314814.62)
        assert summary["grand_total_credit"] == pytest.approx(314814.62)


# ══════════════════════════════════════════════════════════════════════════════
# Section 8: Existing Format Compatibility
# ══════════════════════════════════════════════════════════════════════════════


class TestExistingFormatCompatibility:
    """Ensure that existing Tally Trial Balance exports with standard
    headers continue to import correctly after the changes."""

    def test_standard_debit_credit_headers(self):
        """Standard Tally export: Particulars | Debit | Credit"""
        path = _make_excel([
            ["Trial Balance 2024-25"],
            ["Particulars", "Debit", "Credit"],
            ["Sales", None, 100000],
            ["Purchases", 60000, None],
            ["Cash", 50000, None],
            ["Capital", None, 10000],
            ["Grand Total", 110000, 110000],
        ])
        try:
            result = import_trial_balance(path)
            assert result["success"] is True
            assert len(result["ledgers"]) == 4
            names = [l["ledger_name"] for l in result["ledgers"]]
            assert "Sales" in names
            assert "Purchases" in names
            assert "Cash" in names
            assert "Capital" in names
            assert "Grand Total" not in names
            assert result["summary"]["total_debit"] == pytest.approx(110000)
            assert result["summary"]["total_credit"] == pytest.approx(110000)
        finally:
            os.unlink(path)

    def test_existing_fy_detection_month_name(self):
        """1-Apr-2024 to 31-Mar-2025 must still work."""
        path = _make_excel([
            ["Company X"],
            ["1-Apr-2024 to 31-Mar-2025"],
            ["Particulars", "Debit", "Credit"],
            ["Sales", None, 50000],
        ])
        try:
            result = import_trial_balance(path)
            assert result["success"] is True
            fy = result["import_metadata"]["financial_year"]
            assert fy is not None
            assert "2024" in fy
            assert "2025" in fy
        finally:
            os.unlink(path)

    def test_with_group_column(self):
        """File with explicit Group column still works."""
        path = _make_excel([
            ["Particulars", "Group", "Debit", "Credit"],
            ["Cash", "Current Assets", 50000, None],
            ["Bank", "Current Assets", 30000, None],
            ["Capital", "Capital Account", None, 80000],
        ])
        try:
            result = import_trial_balance(path)
            assert result["success"] is True
            assert len(result["ledgers"]) == 3
        finally:
            os.unlink(path)

    def test_dr_cr_headers(self):
        """Dr | Cr shorthand headers."""
        path = _make_excel([
            ["Ledger Name", "Dr", "Cr"],
            ["Sales", None, 50000],
            ["Purchases", 30000, None],
        ])
        try:
            result = import_trial_balance(path)
            assert result["success"] is True
            assert len(result["ledgers"]) == 2
        finally:
            os.unlink(path)

