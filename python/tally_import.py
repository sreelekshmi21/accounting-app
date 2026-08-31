#!/usr/bin/env python3
"""
Tally Trial Balance Import Engine
==================================
Reads a Tally-exported Trial Balance Excel file, auto-detects columns,
validates data, builds the canonical data model, and outputs JSON to stdout.

Usage:
    python tally_import.py <excel_file_path>
    python tally_import.py --help
"""

import json
import math
import os
import re
import sys
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# ── Constants ──────────────────────────────────────────────────────────────────

# Known column name patterns for auto-detection (case-insensitive).
# Each key maps to a list of regex patterns to try.
COLUMN_PATTERNS: Dict[str, List[str]] = {
    "ledger_name": [
        r"particulars",
        r"ledger\s*name",
        r"ledger",
        r"account\s*name",
        r"account",
        r"name\s*of\s*account",
        r"head\s*of\s*account",
    ],
    "tally_group": [
        r"group",
        r"under\s*group",
        r"parent\s*group",
        r"tally\s*group",
        r"group\s*name",
        r"under",
    ],
    "opening_debit": [
        r"opening.*debit",
        r"op\.?\s*bal\.?\s*\(?dr\)?",
        r"op\.?\s*dr",
    ],
    "opening_credit": [
        r"opening.*credit",
        r"op\.?\s*bal\.?\s*\(?cr\)?",
        r"op\.?\s*cr",
    ],
    "opening_balance": [
        r"opening\s*balance",
        r"op\.?\s*bal",
        r"opening",
    ],
    "debit": [
        r"^debit$",
        r"^dr$",
        r"debit\s*amount",
        r"debit\s*total",
        r"total\s*debit",
        r"dr\s*amount",
        r"current.*debit",
    ],
    "credit": [
        r"^credit$",
        r"^cr$",
        r"credit\s*amount",
        r"credit\s*total",
        r"total\s*credit",
        r"cr\s*amount",
        r"current.*credit",
    ],
    "closing_debit": [
        r"closing.*debit",
        r"cl\.?\s*bal\.?\s*\(?dr\)?",
        r"cl\.?\s*dr",
    ],
    "closing_credit": [
        r"closing.*credit",
        r"cl\.?\s*bal\.?\s*\(?cr\)?",
        r"cl\.?\s*cr",
    ],
    "closing_balance": [
        r"closing\s*balance",
        r"cl\.?\s*bal",
        r"closing",
    ],
}

# Financial year date patterns
FY_PATTERNS = [
    # "1-Apr-2024 to 31-Mar-2025" or "01-04-2024 to 31-03-2025"
    r"(\d{1,2}[-/]\w{3,9}[-/]\d{4})\s*to\s*(\d{1,2}[-/]\w{3,9}[-/]\d{4})",
    # "2024-25" or "2024-2025"
    r"(\d{4})[-/](\d{2,4})",
    # "FY 2024-25"
    r"(?:F\.?Y\.?\s*:?\s*)(\d{4})[-/](\d{2,4})",
    # "April 2024 to March 2025"
    r"(\w+\s+\d{4})\s*to\s*(\w+\s+\d{4})",
]


# ── Utility Functions ──────────────────────────────────────────────────────────


def generate_id(prefix: str = "") -> str:
    """Generate a short unique identifier."""
    short = uuid.uuid4().hex[:12]
    return f"{prefix}{short}" if prefix else short


def clean_numeric(value: Any) -> Optional[float]:
    """
    Convert a cell value to a float, handling:
    - Already numeric values
    - String values with commas, currency symbols, parentheses (negative)
    - Empty/NaN → None
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if math.isnan(value) or math.isinf(value):
            return None
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s or s == "-" or s.lower() in ("nan", "none", "null", ""):
            return None
        # Remove currency symbols and commas
        s = re.sub(r"[₹$€£,\s]", "", s)
        # Handle parenthetical negatives: (1234.56) → -1234.56
        neg = False
        if s.startswith("(") and s.endswith(")"):
            s = s[1:-1]
            neg = True
        # Handle Dr/Cr suffixes
        s = re.sub(r"\s*(Dr|Cr)\.?\s*$", "", s, flags=re.IGNORECASE)
        try:
            val = float(s)
            return -val if neg else val
        except ValueError:
            return None
    return None


def is_grand_total_row(value: Any) -> bool:
    """Check if a cell value indicates a Grand Total row."""
    if not isinstance(value, str):
        return False
    v = value.strip().lower()
    return v in (
        "grand total",
        "total",
        "grand total:",
        "total:",
        "nett total",
    ) or v.startswith("grand total")


def is_group_header_row(row_values: List[Any], num_amount_cols: int) -> bool:
    """
    Heuristic: a group header row typically has a name in the first column
    and no numeric values (or all zeros) in amount columns.
    """
    amount_values = row_values[-num_amount_cols:]
    non_null_amounts = [
        v for v in amount_values if clean_numeric(v) is not None and clean_numeric(v) != 0
    ]
    return len(non_null_amounts) == 0


# ── Sheet Detection ────────────────────────────────────────────────────────────


def detect_trial_balance_sheet(xl: pd.ExcelFile) -> str:
    """
    Find the Trial Balance sheet by name matching.
    Falls back to the first sheet if there is only one.
    """
    sheet_names = xl.sheet_names

    # Try exact/partial matches
    for name in sheet_names:
        lower = name.lower().replace("_", " ").replace("-", " ")
        if "trial balance" in lower or "trial bal" in lower or "tb" == lower:
            return name

    # If only one sheet, use it
    if len(sheet_names) == 1:
        return sheet_names[0]

    # Try looser matches
    for name in sheet_names:
        lower = name.lower()
        if "trial" in lower or "balance" in lower or "tb" in lower:
            return name

    # Default to first sheet
    return sheet_names[0]


# ── Header Detection ──────────────────────────────────────────────────────────


def detect_header_row(
    df_raw: pd.DataFrame, max_scan: int = 25
) -> Tuple[int, Dict[str, int]]:
    """
    Scan the first `max_scan` rows to find the header row.
    Returns (header_row_index, column_mapping).

    The header row is identified by having the most matches against
    known column patterns.
    """
    best_row = 0
    best_mapping: Dict[str, int] = {}
    best_score = 0

    rows_to_scan = min(max_scan, len(df_raw))

    for row_idx in range(rows_to_scan):
        row_values = df_raw.iloc[row_idx].tolist()
        mapping: Dict[str, int] = {}
        score = 0

        for col_idx, cell_val in enumerate(row_values):
            if not isinstance(cell_val, str):
                continue
            cell_text = cell_val.strip().lower()
            if not cell_text:
                continue

            for canonical_name, patterns in COLUMN_PATTERNS.items():
                if canonical_name in mapping:
                    continue
                for pattern in patterns:
                    if re.search(pattern, cell_text, re.IGNORECASE):
                        mapping[canonical_name] = col_idx
                        score += 1
                        break

        # Must have at least ledger_name + one of debit/credit
        has_ledger = "ledger_name" in mapping
        has_amount = "debit" in mapping or "credit" in mapping
        if has_ledger and has_amount and score > best_score:
            best_score = score
            best_row = row_idx
            best_mapping = mapping

    if best_score == 0:
        raise ValueError(
            "Could not detect the header row. The file may not be a valid "
            "Tally Trial Balance export, or the column headers are in an "
            "unexpected format."
        )

    return best_row, best_mapping


# ── Financial Year Detection ──────────────────────────────────────────────────


def parse_fy_from_dates(start_str: str, end_str: str) -> Optional[Dict[str, str]]:
    """Try to parse start/end date strings into FY info."""
    date_formats = [
        "%d-%b-%Y", "%d/%b/%Y", "%d-%m-%Y", "%d/%m/%Y",
        "%d-%B-%Y", "%d/%B/%Y", "%B %Y", "%b %Y",
    ]
    start_date = None
    end_date = None

    for fmt in date_formats:
        try:
            start_date = datetime.strptime(start_str.strip(), fmt)
            break
        except ValueError:
            continue

    for fmt in date_formats:
        try:
            end_date = datetime.strptime(end_str.strip(), fmt)
            break
        except ValueError:
            continue

    if start_date and end_date:
        return {
            "financial_year": f"{start_date.year}-{end_date.year}",
            "fy_start": start_date.strftime("%Y-%m-%d"),
            "fy_end": end_date.strftime("%Y-%m-%d"),
        }

    return None


def detect_financial_year(
    df_raw: pd.DataFrame, sheet_name: str, header_row: int
) -> Dict[str, Optional[str]]:
    """
    Extract financial year from:
    1. Cells above the header row
    2. Sheet name
    3. Header row content
    """
    result: Dict[str, Optional[str]] = {
        "financial_year": None,
        "fy_start": None,
        "fy_end": None,
    }

    # Collect text from pre-header rows and sheet name
    search_texts: List[str] = [sheet_name]
    for row_idx in range(min(header_row, len(df_raw))):
        for cell_val in df_raw.iloc[row_idx].tolist():
            if isinstance(cell_val, str) and cell_val.strip():
                search_texts.append(cell_val.strip())

    for text in search_texts:
        for pattern in FY_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                groups = match.groups()
                if len(groups) == 2:
                    # Try as date range first
                    fy_info = parse_fy_from_dates(groups[0], groups[1])
                    if fy_info:
                        return fy_info

                    # Try as year range (e.g., "2024-25" or "2024-2025")
                    try:
                        start_year = int(groups[0])
                        end_part = groups[1]
                        if len(end_part) == 2:
                            end_year = int(str(start_year)[:2] + end_part)
                        else:
                            end_year = int(end_part)

                        if 2000 <= start_year <= 2100 and start_year < end_year:
                            return {
                                "financial_year": f"{start_year}-{end_year}",
                                "fy_start": f"{start_year}-04-01",
                                "fy_end": f"{end_year}-03-31",
                            }
                    except (ValueError, IndexError):
                        continue

    return result


# ── Group Hierarchy Detection ─────────────────────────────────────────────────


def detect_groups(
    df: pd.DataFrame, col_mapping: Dict[str, int], column_names: List[str]
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Detect Tally group hierarchy from the data.

    Returns:
        groups: List of group dicts with id, name, parent_id, depth
        ledger_group_map: Maps row index → group_id for each ledger row
    """
    groups: List[Dict[str, Any]] = []
    group_name_to_id: Dict[str, str] = {}
    ledger_group_map: Dict[int, str] = {}

    # If there's an explicit group column, use it
    if "tally_group" in col_mapping:
        group_col_idx = col_mapping["tally_group"]
        group_col_name = column_names[group_col_idx]

        for idx, row in df.iterrows():
            group_val = row.iloc[group_col_idx] if group_col_idx < len(row) else None
            if isinstance(group_val, str) and group_val.strip():
                group_name = group_val.strip()
                if group_name not in group_name_to_id:
                    gid = generate_id("g-")
                    group_name_to_id[group_name] = gid
                    groups.append(
                        {
                            "id": gid,
                            "group_name": group_name,
                            "parent_group_id": None,
                            "depth": 0,
                        }
                    )
                ledger_group_map[idx] = group_name_to_id[group_name]
    else:
        # Try to detect groups by indentation or rows with no amounts
        ledger_col_idx = col_mapping["ledger_name"]

        # Determine the number of amount columns
        amount_cols = [
            k
            for k in col_mapping
            if k
            in (
                "debit",
                "credit",
                "opening_debit",
                "opening_credit",
                "closing_debit",
                "closing_credit",
                "opening_balance",
                "closing_balance",
            )
        ]
        num_amount_cols = len(amount_cols)
        current_group_id: Optional[str] = None

        for idx, row in df.iterrows():
            ledger_val = row.iloc[ledger_col_idx] if ledger_col_idx < len(row) else None
            if not isinstance(ledger_val, str) or not ledger_val.strip():
                continue

            ledger_text = ledger_val.strip()

            # Skip grand total
            if is_grand_total_row(ledger_text):
                continue

            # Check if this row has amounts
            row_values = row.tolist()
            has_amounts = False
            for ac in amount_cols:
                cidx = col_mapping[ac]
                if cidx < len(row_values):
                    v = clean_numeric(row_values[cidx])
                    if v is not None and v != 0:
                        has_amounts = True
                        break

            if not has_amounts and num_amount_cols > 0:
                # This could be a group header row
                if ledger_text not in group_name_to_id:
                    gid = generate_id("g-")
                    group_name_to_id[ledger_text] = gid
                    groups.append(
                        {
                            "id": gid,
                            "group_name": ledger_text,
                            "parent_group_id": None,
                            "depth": 0,
                        }
                    )
                current_group_id = group_name_to_id[ledger_text]
            else:
                # This is a ledger row
                if current_group_id:
                    ledger_group_map[idx] = current_group_id

    return groups, ledger_group_map


# ── Main Import Function ──────────────────────────────────────────────────────


def import_trial_balance(file_path: str) -> Dict[str, Any]:
    """
    Main entry point: import a Tally Trial Balance Excel file.

    Args:
        file_path: Absolute path to the Excel file.

    Returns:
        Canonical JSON-serializable dict with import results.
    """
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    # ── 1. Validate file exists ───────────────────────────────────────────
    if not os.path.isfile(file_path):
        return {
            "success": False,
            "error": f"File not found: {file_path}",
            "import_metadata": None,
            "summary": None,
            "validation": {
                "is_valid": False,
                "errors": [{"type": "FILE_NOT_FOUND", "message": f"File not found: {file_path}"}],
                "warnings": [],
            },
            "groups": [],
            "ledgers": [],
        }

    # ── 2. Open Excel file ────────────────────────────────────────────────
    try:
        xl = pd.ExcelFile(file_path, engine="openpyxl")
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to open Excel file: {str(e)}",
            "import_metadata": None,
            "summary": None,
            "validation": {
                "is_valid": False,
                "errors": [
                    {"type": "FILE_READ_ERROR", "message": f"Cannot read Excel file: {str(e)}"}
                ],
                "warnings": [],
            },
            "groups": [],
            "ledgers": [],
        }

    # ── 3. Detect sheet ───────────────────────────────────────────────────
    sheet_name = detect_trial_balance_sheet(xl)

    # Read all data as raw (no header inference)
    df_raw = pd.read_excel(xl, sheet_name=sheet_name, header=None)

    if df_raw.empty:
        return {
            "success": False,
            "error": "The selected sheet is empty.",
            "import_metadata": None,
            "summary": None,
            "validation": {
                "is_valid": False,
                "errors": [{"type": "EMPTY_SHEET", "message": "The selected sheet contains no data."}],
                "warnings": [],
            },
            "groups": [],
            "ledgers": [],
        }

    # ── 4. Detect header row and columns ──────────────────────────────────
    try:
        header_row, col_mapping = detect_header_row(df_raw)
    except ValueError as e:
        return {
            "success": False,
            "error": str(e),
            "import_metadata": None,
            "summary": None,
            "validation": {
                "is_valid": False,
                "errors": [{"type": "HEADER_NOT_FOUND", "message": str(e)}],
                "warnings": [],
            },
            "groups": [],
            "ledgers": [],
        }

    # ── 5. Detect financial year ──────────────────────────────────────────
    fy_info = detect_financial_year(df_raw, sheet_name, header_row)

    # ── 6. Extract data below header ──────────────────────────────────────
    column_names = df_raw.iloc[header_row].tolist()
    # Data starts one row after the header
    df_data = df_raw.iloc[header_row + 1:].reset_index(drop=True)

    # Build detected columns info for metadata
    detected_columns: Dict[str, Optional[str]] = {}
    for canonical, col_idx in col_mapping.items():
        col_name = column_names[col_idx] if col_idx < len(column_names) else f"Column {col_idx}"
        detected_columns[canonical] = str(col_name) if col_name is not None else f"Column {col_idx}"

    # ── 7. Handle combined opening/closing balance columns ────────────────
    # If there's a single "opening_balance" column but no separate debit/credit,
    # treat positive values as debit and negative as credit (or vice versa based on Tally convention)
    # This is handled during ledger extraction.

    # ── 8. Detect groups ──────────────────────────────────────────────────
    groups, ledger_group_map = detect_groups(df_data, col_mapping, column_names)

    # ── 9. Extract ledgers ────────────────────────────────────────────────
    ledger_col_idx = col_mapping["ledger_name"]
    ledgers: List[Dict[str, Any]] = []
    seen_ledger_names: Dict[str, int] = {}  # name → first row for duplicate detection

    grand_total_debit: Optional[float] = None
    grand_total_credit: Optional[float] = None

    for idx, row in df_data.iterrows():
        row_values = row.tolist()

        # Get ledger name
        ledger_val = row_values[ledger_col_idx] if ledger_col_idx < len(row_values) else None
        if not isinstance(ledger_val, str) or not ledger_val.strip():
            continue

        ledger_name = ledger_val.strip()

        # Check for Grand Total row
        if is_grand_total_row(ledger_name):
            if "debit" in col_mapping:
                grand_total_debit = clean_numeric(
                    row_values[col_mapping["debit"]] if col_mapping["debit"] < len(row_values) else None
                )
            if "credit" in col_mapping:
                grand_total_credit = clean_numeric(
                    row_values[col_mapping["credit"]] if col_mapping["credit"] < len(row_values) else None
                )
            continue

        # Skip rows that were identified as group headers (no amounts)
        if idx in ledger_group_map or "tally_group" in col_mapping:
            pass  # has a group assignment, this is a ledger row
        else:
            # Check if this looks like a group header (no amounts)
            amount_keys = [k for k in col_mapping if k in ("debit", "credit")]
            all_zero = True
            for ak in amount_keys:
                v = clean_numeric(
                    row_values[col_mapping[ak]] if col_mapping[ak] < len(row_values) else None
                )
                if v is not None and v != 0:
                    all_zero = False
                    break
            if all_zero and amount_keys and "tally_group" not in col_mapping:
                # Likely a group header, already handled in detect_groups
                continue

        # Extract amounts
        def get_amount(key: str) -> Optional[float]:
            if key in col_mapping and col_mapping[key] < len(row_values):
                return clean_numeric(row_values[col_mapping[key]])
            return None

        debit = get_amount("debit") or 0.0
        credit = get_amount("credit") or 0.0

        # Opening balances
        opening_debit = get_amount("opening_debit") or 0.0
        opening_credit = get_amount("opening_credit") or 0.0

        # Handle combined opening balance column
        if "opening_balance" in col_mapping and "opening_debit" not in col_mapping:
            ob = get_amount("opening_balance")
            if ob is not None:
                if ob >= 0:
                    opening_debit = abs(ob)
                    opening_credit = 0.0
                else:
                    opening_debit = 0.0
                    opening_credit = abs(ob)

        # Closing balances
        closing_debit = get_amount("closing_debit") or 0.0
        closing_credit = get_amount("closing_credit") or 0.0

        # Handle combined closing balance column
        if "closing_balance" in col_mapping and "closing_debit" not in col_mapping:
            cb = get_amount("closing_balance")
            if cb is not None:
                if cb >= 0:
                    closing_debit = abs(cb)
                    closing_credit = 0.0
                else:
                    closing_debit = 0.0
                    closing_credit = abs(cb)

        # Net balance = debit - credit
        net_balance = debit - credit

        # Source row number (1-indexed, relative to Excel, accounting for header)
        source_row = header_row + 2 + idx  # +2 for 1-indexing and header row itself

        # Validation: check for invalid numbers
        raw_debit = row_values[col_mapping["debit"]] if "debit" in col_mapping and col_mapping["debit"] < len(row_values) else None
        raw_credit = row_values[col_mapping["credit"]] if "credit" in col_mapping and col_mapping["credit"] < len(row_values) else None

        if "debit" in col_mapping and raw_debit is not None:
            if isinstance(raw_debit, str) and raw_debit.strip() and clean_numeric(raw_debit) is None:
                errors.append({
                    "type": "INVALID_NUMBER",
                    "message": f"Invalid debit value '{raw_debit}' for ledger '{ledger_name}'",
                    "row": source_row,
                    "ledger": ledger_name,
                })

        if "credit" in col_mapping and raw_credit is not None:
            if isinstance(raw_credit, str) and raw_credit.strip() and clean_numeric(raw_credit) is None:
                errors.append({
                    "type": "INVALID_NUMBER",
                    "message": f"Invalid credit value '{raw_credit}' for ledger '{ledger_name}'",
                    "row": source_row,
                    "ledger": ledger_name,
                })

        # Duplicate check
        if ledger_name in seen_ledger_names:
            warnings.append({
                "type": "DUPLICATE_LEDGER",
                "message": f"Duplicate ledger name '{ledger_name}' (first at row {seen_ledger_names[ledger_name]}, also at row {source_row})",
                "row": source_row,
                "ledger": ledger_name,
            })
        else:
            seen_ledger_names[ledger_name] = source_row

        # Group assignment
        tally_group_id = ledger_group_map.get(idx)
        if not tally_group_id and "tally_group" not in col_mapping:
            warnings.append({
                "type": "MISSING_GROUP",
                "message": f"No group detected for ledger '{ledger_name}'",
                "row": source_row,
                "ledger": ledger_name,
            })

        ledger = {
            "id": generate_id("l-"),
            "ledger_name": ledger_name,
            "tally_group_id": tally_group_id,
            "source_row_number": source_row,
            "opening_debit": round(opening_debit, 2),
            "opening_credit": round(opening_credit, 2),
            "debit": round(debit, 2),
            "credit": round(credit, 2),
            "closing_debit": round(closing_debit, 2),
            "closing_credit": round(closing_credit, 2),
            "net_balance": round(net_balance, 2),
        }
        ledgers.append(ledger)

    # ── 10. Validation: missing ledger names ──────────────────────────────
    if not ledgers:
        errors.append({
            "type": "NO_LEDGERS",
            "message": "No ledger entries found in the file.",
        })

    # ── 11. Compute summary totals ────────────────────────────────────────
    total_debit = round(sum(l["debit"] for l in ledgers), 2)
    total_credit = round(sum(l["credit"] for l in ledgers), 2)
    difference = round(total_debit - total_credit, 2)

    opening_debit_total = round(sum(l["opening_debit"] for l in ledgers), 2)
    opening_credit_total = round(sum(l["opening_credit"] for l in ledgers), 2)
    closing_debit_total = round(sum(l["closing_debit"] for l in ledgers), 2)
    closing_credit_total = round(sum(l["closing_credit"] for l in ledgers), 2)

    has_opening = "opening_debit" in col_mapping or "opening_credit" in col_mapping or "opening_balance" in col_mapping
    has_closing = "closing_debit" in col_mapping or "closing_credit" in col_mapping or "closing_balance" in col_mapping

    # ── 12. Validate debit/credit totals ──────────────────────────────────
    if abs(difference) > 0.01:
        warnings.append({
            "type": "DEBIT_CREDIT_MISMATCH",
            "message": f"Debit total ({total_debit:,.2f}) does not match Credit total ({total_credit:,.2f}). Difference: {difference:,.2f}",
        })

    # ── 13. Validate against Grand Total row (if found) ───────────────────
    if grand_total_debit is not None:
        diff_gt_debit = round(abs(total_debit - grand_total_debit), 2)
        if diff_gt_debit > 0.01:
            warnings.append({
                "type": "GRAND_TOTAL_DEBIT_MISMATCH",
                "message": f"Computed debit total ({total_debit:,.2f}) differs from Grand Total row ({grand_total_debit:,.2f}) by {diff_gt_debit:,.2f}",
            })

    if grand_total_credit is not None:
        diff_gt_credit = round(abs(total_credit - grand_total_credit), 2)
        if diff_gt_credit > 0.01:
            warnings.append({
                "type": "GRAND_TOTAL_CREDIT_MISMATCH",
                "message": f"Computed credit total ({total_credit:,.2f}) differs from Grand Total row ({grand_total_credit:,.2f}) by {diff_gt_credit:,.2f}",
            })

    # ── 14. Build result ──────────────────────────────────────────────────
    is_valid = len(errors) == 0

    return {
        "success": True,
        "import_metadata": {
            "file_name": os.path.basename(file_path),
            "file_path": file_path,
            "sheet_name": sheet_name,
            "financial_year": fy_info.get("financial_year"),
            "fy_start": fy_info.get("fy_start"),
            "fy_end": fy_info.get("fy_end"),
            "import_timestamp": datetime.now().isoformat(),
            "detected_columns": detected_columns,
            "header_row": header_row + 1,  # 1-indexed for display
            "total_rows": len(df_data),
        },
        "summary": {
            "ledger_count": len(ledgers),
            "total_debit": total_debit,
            "total_credit": total_credit,
            "difference": difference,
            "opening_debit_total": opening_debit_total if has_opening else None,
            "opening_credit_total": opening_credit_total if has_opening else None,
            "closing_debit_total": closing_debit_total if has_closing else None,
            "closing_credit_total": closing_credit_total if has_closing else None,
            "has_opening_balances": has_opening,
            "has_closing_balances": has_closing,
            "has_previous_year": False,
            "grand_total_debit": grand_total_debit,
            "grand_total_credit": grand_total_credit,
        },
        "validation": {
            "is_valid": is_valid,
            "errors": errors,
            "warnings": warnings,
        },
        "groups": groups,
        "ledgers": ledgers,
    }


# ── CLI Entry Point ───────────────────────────────────────────────────────────


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print(
            "Tally Trial Balance Import Engine\n"
            "\n"
            "Usage:\n"
            "  python tally_import.py <excel_file_path>\n"
            "\n"
            "Reads a Tally-exported Trial Balance Excel file,\n"
            "auto-detects columns, validates data, and outputs\n"
            "canonical JSON to stdout.\n"
            "\n"
            "Options:\n"
            "  --help, -h   Show this help message\n",
            file=sys.stderr if "--help" in sys.argv or "-h" in sys.argv else sys.stdout,
        )
        sys.exit(0 if "--help" in sys.argv or "-h" in sys.argv else 1)

    file_path = sys.argv[1]

    try:
        result = import_trial_balance(file_path)
        # Output JSON to stdout for the Electron process to consume
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "import_metadata": None,
            "summary": None,
            "validation": {
                "is_valid": False,
                "errors": [
                    {"type": "UNEXPECTED_ERROR", "message": str(e)}
                ],
                "warnings": [],
            },
            "groups": [],
            "ledgers": [],
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
