# financial_overview.py
# ---------------------------------------------------------------------------
# Backend for the "Financial Overview" dashboard page.
# Pulls live numbers from GL Entry (for revenue/profit) and Sales Invoice
# Item (for the revenue breakdown by product line).
#
# IMPORTANT — please review the CONFIG section below and adjust the
# item-group / account-type mapping to match your actual Chart of Accounts
# and Item Group tree. Sensible ERPNext defaults are used, but every company
# sets these up a bit differently.
# ---------------------------------------------------------------------------

import calendar

import frappe
from frappe import _
from frappe.utils import flt, add_months, getdate

# ---------------------------------------------------------------------------
# CONFIG — adjust to match your setup
# ---------------------------------------------------------------------------

# Which Item Groups roll up into which bucket on the "Revenue Breakdown" donut.
# Anything not listed here falls into "Other Revenue".
REVENUE_BUCKETS = {
	"Product Sales": ["Products", "Licenses", "Software"],
	"Service Revenue": ["Services", "Support", "Consulting"],
}

# Account types that make up cost of goods sold / operating expense / depreciation.
# These map to the standard ERPNext "Account Type" field on the Account doctype.
COGS_ACCOUNT_TYPE = "Cost of Goods Sold"
DEPRECIATION_ACCOUNT_TYPE = "Depreciation"
NON_OPERATING_ACCOUNT_TYPES = ["Tax", "Depreciation"]

COLORS = ["#1c6b4a", "#e3a627", "#d9824f", "#7a9e8f", "#b0763f"]

# Default currency symbol - QAR for Qatar (ر.ق) or you can use "QAR"
DEFAULT_CURRENCY_SYMBOL = "QAR"

# ---------------------------------------------------------------------------
# EBITDA (Overview tab stat card) — CONFIG
# ---------------------------------------------------------------------------
# The "EBITDA" stat card on the Overview tab is driven off the same
# custom_pl_report_category / PL Category / PL Category Group mapping used
# by the Statements tab (NOT the GL Entry account_type mapping used by the
# rest of this page). This mirrors the client's own query:
#
#   EBIT  = sum of all GL activity on accounts whose PL Category belongs to
#           the "Revenue", "Cost of Revenue" or "Operating Expenses" groups.
#   D&A   = sum of all GL activity on accounts whose PL Category is
#           "Depreciation & Amortization".
#   EBITDA = EBIT - D&A   (D&A comes out signed/negative in this convention,
#            so subtracting it effectively adds the depreciation back).
EBITDA_EBIT_PL_GROUPS = ["Revenue", "Cost of Revenue", "Operating Expenses"]
EBITDA_DNA_PL_CATEGORY = "Depreciation & Amortization"

# ---------------------------------------------------------------------------
# STATEMENTS TAB — CONFIG
# ---------------------------------------------------------------------------
# The "Statements" tab is entirely driven by two custom doctypes that already
# exist on the site:
#
#   - "PL Category"       (fields: name1 -> Category, sort, category_group)
#   - "PL Category Group" (fields: name1 -> Name, sort)
#
# ...plus a custom Link field on Account: "custom_pl_report_category" that
# points to "PL Category".
#
# Only accounts where:
#   account_type != "Group"  AND  report_type == "Profit and Loss"
#   AND custom_pl_report_category is set
# are pulled into the statement (exactly the 2 conditions given for this
# feature).
#
# Group ordering follows the "sort" field on PL Category Group itself (not
# an inferred value), and categories inside a group are ordered by their own
# "sort" value.
#
# After specific groups, a running "Calculated Field" row is inserted
# (Gross Profit, Operating Income (EBIT)).
STATEMENT_CALC_AFTER_GROUP = {
	"Cost of Revenue": "Gross Profit",
	"Operating Expenses": "Operating Income (EBIT)",
}

# "Other Income & Expense" always gets an "Income Before Tax" row right
# after it, and "Taxes" always gets the "Net Income" row right after it —
# so Net Income is always the very last row, after Taxes, regardless of
# whether any tax was actually posted for the period.
STATEMENT_PRETAX_GROUP = "Other Income & Expense"
STATEMENT_TAX_GROUP = "Taxes"

# GL Entries excluded from every Statements-tab total — Period Closing
# Vouchers would otherwise double-count what the year's category totals
# already reflect.
STATEMENT_EXCLUDED_VOUCHER_TYPES = ["Period Closing Voucher"]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_dashboard_data(company=None, fiscal_year=None):
	"""Main API called from financial_overview.js"""

	# If no company provided, use user's default or first available company
	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		company = get_first_company()
	
	if not company:
		frappe.throw(_("No company found. Please set up a Company first."))

	fy_name, fy_start, fy_end = get_fiscal_year_details(fiscal_year, company)
	py_name, py_start, py_end = get_prior_fiscal_year(fy_start)

	# Every number on this page is rendered in the selected company's own
	# currency — never hardcoded — so switching companies also switches
	# the currency symbol shown throughout the page.
	currency_symbol = get_currency_symbol(company)

	# Load both fiscal years in one GL query. The old implementation issued
	# dozens of almost-identical SQL queries for totals, quarters and trend.
	# Keeping the data in memory for this request makes the dashboard much faster.
	gl_from = py_start or fy_start
	gl_rows = load_gl_data(company, gl_from, fy_end)

	# --- top-level revenue -------------------------------------------------
	revenue_cy = sum_gl_data(gl_rows, fy_start, fy_end, root_type="Income")
	revenue_py = sum_gl_data(gl_rows, py_start, py_end, root_type="Income") if py_start else 0

	# --- profitability metrics ---------------------------------------------
	cogs_cy = sum_gl_data(gl_rows, fy_start, fy_end, root_type="Expense", account_type=COGS_ACCOUNT_TYPE)
	cogs_py = sum_gl_data(gl_rows, py_start, py_end, root_type="Expense", account_type=COGS_ACCOUNT_TYPE) if py_start else 0

	total_expense_cy = sum_gl_data(gl_rows, fy_start, fy_end, root_type="Expense")
	total_expense_py = sum_gl_data(gl_rows, py_start, py_end, root_type="Expense") if py_start else 0

	depreciation_cy = sum_gl_data(gl_rows, fy_start, fy_end, root_type="Expense", account_type=DEPRECIATION_ACCOUNT_TYPE)
	depreciation_py = sum_gl_data(gl_rows, py_start, py_end, root_type="Expense", account_type=DEPRECIATION_ACCOUNT_TYPE) if py_start else 0

	operating_expense_cy = sum_gl_data(
		gl_rows, fy_start, fy_end, root_type="Expense", exclude_account_types=[COGS_ACCOUNT_TYPE] + NON_OPERATING_ACCOUNT_TYPES
	)
	operating_expense_py = (
		sum_gl_data(gl_rows, py_start, py_end, root_type="Expense", exclude_account_types=[COGS_ACCOUNT_TYPE] + NON_OPERATING_ACCOUNT_TYPES)
		if py_start
		else 0
	)

	gross_profit_cy = revenue_cy - cogs_cy
	gross_profit_py = revenue_py - cogs_py

	operating_income_cy = gross_profit_cy - operating_expense_cy
	operating_income_py = gross_profit_py - operating_expense_py

	net_income_cy = revenue_cy - total_expense_cy
	net_income_py = revenue_py - total_expense_py

	ebitda_cy = operating_income_cy + depreciation_cy
	ebitda_py = operating_income_py + depreciation_py

	# --- quarterly split for the mini bar charts ----------------------------
	stat_cards = [
		build_stat_card("gross_profit", "dollar-sign", _("Gross Profit"), gl_rows, fy_start, fy_end, py_start, py_end,
			currency_symbol, root_type="Expense", account_type=COGS_ACCOUNT_TYPE, is_profit_metric=True, revenue_based=True),
		build_stat_card("operating_income", "bar-chart-2", _("Operating Income"), gl_rows, fy_start, fy_end, py_start, py_end,
			currency_symbol, root_type="Expense", exclude_account_types=[COGS_ACCOUNT_TYPE] + NON_OPERATING_ACCOUNT_TYPES,
			is_profit_metric=True, revenue_based=True, subtract_from="gross_profit"),
		build_stat_card("net_income", "credit-card", _("Net Income"), gl_rows, fy_start, fy_end, py_start, py_end,
			currency_symbol, root_type="Expense", is_profit_metric=True, revenue_based=True),
		build_ebitda_stat_card(company, fy_start, fy_end, py_start, py_end, currency_symbol),
	]

	# --- revenue breakdown (donut) ------------------------------------------
	revenue_breakdown = get_revenue_breakdown(company, fy_start, fy_end, currency_symbol)

	# --- monthly trend -------------------------------------------------------
	trend = get_monthly_trend(gl_rows, fy_start, fy_end, py_start, py_end, currency_symbol)

	return {
		"company": company,
		"fiscal_year": fy_name,
		"prior_fiscal_year": py_name,
		"currency_symbol": currency_symbol,
		"total_revenue": {
			"value_fmt": fmt_m(revenue_cy, currency_symbol),
			"change_pct": pct_change(revenue_cy, revenue_py),
			"vs_amount_fmt": fmt_delta(revenue_cy - revenue_py, currency_symbol),
			"gross_margin": round(pct_of(gross_profit_cy, revenue_cy), 1),
			"net_margin": round(pct_of(net_income_cy, revenue_cy), 1),
		},
		"stat_cards": stat_cards,
		"revenue_breakdown": revenue_breakdown,
		"revenue_total_fmt": fmt_m(revenue_cy, currency_symbol),
		"trend": trend,
	}


# ---------------------------------------------------------------------------
# Stat card (quarterly bars + YoY tooltip data) builder
# ---------------------------------------------------------------------------

def build_stat_card(key, icon, label, gl_rows, fy_start, fy_end, py_start, py_end, currency_symbol,
	root_type=None, account_type=None, exclude_account_types=None,
	is_profit_metric=False, revenue_based=False, subtract_from=None, add_back=None):
	quarters = []
	q_dates_cy = get_quarter_dates(fy_start, fy_end)
	q_dates_py = get_quarter_dates(py_start, py_end) if py_start else [None, None, None, None]

	for i in range(4):
		q_start, q_end = q_dates_cy[i]
		value_cy = compute_metric_from_rows(
			gl_rows, q_start, q_end, root_type, account_type, exclude_account_types, add_back, revenue_based
		)

		if py_start:
			pq_start, pq_end = q_dates_py[i]
			value_py = compute_metric_from_rows(
				gl_rows, pq_start, pq_end, root_type, account_type, exclude_account_types, add_back, revenue_based
			)
		else:
			value_py = 0

		quarters.append({
			"label": "Q%d" % (i + 1),
			"value": round(value_cy, 3),
			"change_pct": pct_change(value_cy, value_py),
		})

	total_cy = sum(q["value"] for q in quarters)
	total_py_metric = (
		compute_metric_from_rows(
			gl_rows, py_start, py_end, root_type, account_type, exclude_account_types, add_back, revenue_based
		)
		if py_start
		else 0
	)

	max_abs = max([abs(q["value"]) for q in quarters] + [0.001])
	for q in quarters:
		q["bar_pct"] = round(max(6, abs(q["value"]) / max_abs * 100), 1)
		q["is_down"] = q["value"] < 0 or q["change_pct"] < 0

	return {
		"key": key,
		"icon": icon,
		"label": label,
		"value_fmt": fmt_m(total_cy, currency_symbol),
		"prior_value_fmt": fmt_m(total_py_metric, currency_symbol),
		"change_pct": pct_change(total_cy, total_py_metric),
		"quarters": quarters,
	}


def compute_metric_from_rows(rows, start, end, root_type, account_type, exclude_account_types, add_back, revenue_based):
	if not start or not end:
		return 0

	revenue = sum_gl_data(rows, start, end, root_type="Income")
	expense = sum_gl_data(
		rows, start, end, root_type=root_type, account_type=account_type, exclude_account_types=exclude_account_types
	)
	value = (revenue - expense) if revenue_based else expense

	if add_back:
		value += sum_gl_data(rows, start, end, root_type="Expense", account_type=add_back)

	return value


# ---------------------------------------------------------------------------
# EBITDA stat card — driven off the PL Category / PL Category Group mapping
# (same mapping the Statements tab uses), not the account_type mapping used
# by the rest of this page. See EBITDA_* CONFIG at the top of the file.
# ---------------------------------------------------------------------------

def get_ebit_and_dna(company, from_date, to_date):
	"""Returns (ebit, dna) in millions for the given period, computed exactly
	like the client's own query: signed sums of (debit - credit) * -1 over
	accounts grouped via custom_pl_report_category -> PL Category ->
	PL Category Group."""

	if not company or not from_date or not to_date:
		return 0, 0

	ebit_row = frappe.db.sql(
		"""
		SELECT COALESCE(SUM((gl.debit - gl.credit) * -1), 0) AS amount
		FROM `tabGL Entry` gl
		JOIN `tabAccount` acc ON acc.name = gl.account
		JOIN `tabPL Category` pc ON pc.name = acc.custom_pl_report_category
		JOIN `tabPL Category Group` plg ON plg.name = pc.category_group
		WHERE gl.company = %(company)s
			AND gl.docstatus = 1
			AND gl.is_cancelled = 0
			AND gl.voucher_type NOT IN %(excluded_voucher_types)s
			AND gl.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND plg.name IN %(groups)s
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			"groups": EBITDA_EBIT_PL_GROUPS,
			"excluded_voucher_types": STATEMENT_EXCLUDED_VOUCHER_TYPES,
		},
		as_dict=True,
	)

	dna_row = frappe.db.sql(
		"""
		SELECT COALESCE(SUM((gl.debit - gl.credit) * -1), 0) AS amount
		FROM `tabGL Entry` gl
		JOIN `tabAccount` acc ON acc.name = gl.account
		JOIN `tabPL Category` pc ON pc.name = acc.custom_pl_report_category
		WHERE gl.company = %(company)s
			AND gl.docstatus = 1
			AND gl.is_cancelled = 0
			AND gl.voucher_type NOT IN %(excluded_voucher_types)s
			AND gl.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND pc.name = %(dna_category)s
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			"dna_category": EBITDA_DNA_PL_CATEGORY,
			"excluded_voucher_types": STATEMENT_EXCLUDED_VOUCHER_TYPES,
		},
		as_dict=True,
	)

	ebit = flt(ebit_row[0].amount) / 1_000_000 if ebit_row else 0
	dna = flt(dna_row[0].amount) / 1_000_000 if dna_row else 0
	return ebit, dna


def build_ebitda_stat_card(company, fy_start, fy_end, py_start, py_end, currency_symbol):
	"""EBITDA = EBIT - D&A (D&A comes out signed/negative in this
	convention, so subtracting it adds the depreciation back)."""

	quarters = []
	q_dates_cy = get_quarter_dates(fy_start, fy_end)
	q_dates_py = get_quarter_dates(py_start, py_end) if py_start else [None, None, None, None]

	for i in range(4):
		q_start, q_end = q_dates_cy[i]
		ebit_cy, dna_cy = get_ebit_and_dna(company, q_start, q_end)
		value_cy = ebit_cy - dna_cy

		if py_start:
			pq_start, pq_end = q_dates_py[i]
			ebit_py, dna_py = get_ebit_and_dna(company, pq_start, pq_end)
			value_py = ebit_py - dna_py
		else:
			value_py = 0

		quarters.append({
			"label": "Q%d" % (i + 1),
			"value": round(value_cy, 3),
			"change_pct": pct_change(value_cy, value_py),
		})

	total_cy = sum(q["value"] for q in quarters)

	if py_start:
		ebit_py_total, dna_py_total = get_ebit_and_dna(company, py_start, py_end)
		total_py = ebit_py_total - dna_py_total
	else:
		total_py = 0

	max_abs = max([abs(q["value"]) for q in quarters] + [0.001])
	for q in quarters:
		q["bar_pct"] = round(max(6, abs(q["value"]) / max_abs * 100), 1)
		q["is_down"] = q["value"] < 0 or q["change_pct"] < 0

	return {
		"key": "ebitda",
		"icon": "pie-chart",
		"label": _("EBITDA"),
		"value_fmt": fmt_m(total_cy, currency_symbol),
		"prior_value_fmt": fmt_m(total_py, currency_symbol),
		"change_pct": pct_change(total_cy, total_py),
		"quarters": quarters,
	}


# ---------------------------------------------------------------------------
# Revenue breakdown (donut + sub-item hover breakdown)
# ---------------------------------------------------------------------------

def get_revenue_breakdown(company, from_date, to_date, currency_symbol):
	rows = frappe.db.sql(
		"""
		SELECT ig.name AS item_group, SUM(sii.base_net_amount) AS amount
		FROM `tabSales Invoice Item` sii
		JOIN `tabSales Invoice` si ON si.name = sii.parent
		JOIN `tabItem Group` ig ON ig.name = sii.item_group
		WHERE si.docstatus = 1 AND si.company = %(company)s
			AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY ig.name
		""",
		{"company": company, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)

	buckets = {"Product Sales": 0, "Service Revenue": 0, "Other Revenue": 0}
	bucket_groups = {"Product Sales": [], "Service Revenue": [], "Other Revenue": []}

	for row in rows:
		bucket = classify_item_group(row.item_group)
		buckets[bucket] += flt(row.amount)
		bucket_groups[bucket].append(row)

	total = sum(buckets.values()) or 1
	result = []
	for i, (label, amount) in enumerate(buckets.items()):
		if amount <= 0:
			continue
		sub_items = sorted(bucket_groups[label], key=lambda r: flt(r.amount), reverse=True)[:4]
		sub_total = sum(flt(r.amount) for r in sub_items) or 1
		result.append({
			"label": _(label),
			"value_fmt": fmt_m(amount / 1_000_000, currency_symbol),
			"pct": round(amount / total * 100, 1),
			"color": COLORS[i % len(COLORS)],
			"sub_items": [
				{
					"label": r.item_group,
					"value_fmt": fmt_m(flt(r.amount) / 1_000_000, currency_symbol),
					"bar_pct": round(flt(r.amount) / sub_total * 100, 1),
				}
				for r in sub_items
			],
		})
	return result


def classify_item_group(item_group):
	for bucket, groups in REVENUE_BUCKETS.items():
		if item_group in groups:
			return bucket
	return "Other Revenue"


# ---------------------------------------------------------------------------
# Monthly trend (current year vs prior year, with YoY per point for hover)
# ---------------------------------------------------------------------------

def get_monthly_trend(gl_rows, fy_start, fy_end, py_start, py_end, currency_symbol):
	months = []
	current = []
	prior = []
	start = getdate(fy_start)
	prior_start = getdate(py_start) if py_start else None

	for i in range(12):
		cy_start = add_months(start, i)
		cy_end = add_months(start, i + 1)
		cy_end = add_months(cy_end, 0)
		from datetime import timedelta
		cy_end = cy_end - timedelta(days=1)

		py_start_month = add_months(prior_start, i) if prior_start else None
		py_end_month = add_months(prior_start, i + 1) - timedelta(days=1) if prior_start else None

		label = calendar.month_abbr[cy_start.month]
		cy_val = round(sum_gl_data(gl_rows, cy_start, cy_end, root_type="Income"), 3)
		py_val = round(sum_gl_data(gl_rows, py_start_month, py_end_month, root_type="Income"), 3) if prior_start else 0

		months.append(label)
		current.append({
			"month": label,
			"value": cy_val,
			"prior": py_val,
			"change_pct": pct_change(cy_val, py_val),
			"change_amount_fmt": fmt_delta(cy_val - py_val, currency_symbol),
		})
		prior.append(py_val)

	all_vals = [c["value"] for c in current] + prior
	y_min = min(all_vals) * 0.95 if all_vals else 0
	y_max = max(all_vals) * 1.05 if all_vals else 1

	return {
		"months": months,
		"current": current,
		"y_min": round(y_min, 2),
		"y_max": round(y_max, 2),
	}


# ---------------------------------------------------------------------------
# GL Entry helpers
# ---------------------------------------------------------------------------

def load_gl_data(company, from_date, to_date):
	"""Load all relevant GL rows for both fiscal years in one SQL query."""
	if not company or not from_date or not to_date:
		return []

	return frappe.db.sql(
		"""
		SELECT
			gle.posting_date,
			acc.root_type,
			COALESCE(acc.account_type, '') AS account_type,
			SUM(gle.debit) AS debit,
			SUM(gle.credit) AS credit
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON gle.account = acc.name
		WHERE gle.company = %(company)s
			AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND gle.is_cancelled = 0
		GROUP BY gle.posting_date, acc.root_type, acc.account_type
		ORDER BY gle.posting_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
		},
		as_dict=True,
	)


def sum_gl_data(rows, start, end, root_type=None, account_type=None, exclude_account_types=None):
	"""Sum already-loaded GL data, returning values in millions."""
	if not rows or not start or not end:
		return 0

	start = getdate(start)
	end = getdate(end)
	excluded = set(exclude_account_types or [])
	total = 0

	for row in rows:
		posting_date = getdate(row.posting_date)
		if posting_date < start or posting_date > end:
			continue
		if root_type and row.root_type != root_type:
			continue
		if account_type and row.account_type != account_type:
			continue
		if excluded and row.account_type in excluded:
			continue

		if row.root_type == "Income":
			total += flt(row.credit) - flt(row.debit)
		else:
			total += flt(row.debit) - flt(row.credit)

	return total / 1_000_000


# Kept for compatibility with any other code that may call this helper directly.
def get_gl_total(company, from_date, to_date, root_type=None, account_type=None, exclude_account_types=None):
	rows = load_gl_data(company, from_date, to_date)
	return sum_gl_data(rows, from_date, to_date, root_type, account_type, exclude_account_types)


def get_gl_monthly(company, from_date, to_date, root_type=None, account_type=None, exclude_account_types=None):
	rows = load_gl_data(company, from_date, to_date)
	if not rows:
		return {}

	monthly = {}
	for row in rows:
		posting_date = getdate(row.posting_date)
		if posting_date < getdate(from_date) or posting_date > getdate(to_date):
			continue
		if root_type and row.root_type != root_type:
			continue
		if account_type and row.account_type != account_type:
			continue
		if exclude_account_types and row.account_type in set(exclude_account_types):
			continue

		amount = flt(row.credit) - flt(row.debit) if row.root_type == "Income" else flt(row.debit) - flt(row.credit)
		monthly[posting_date.month] = monthly.get(posting_date.month, 0) + amount

	return {month: amount / 1_000_000 for month, amount in monthly.items()}


# ---------------------------------------------------------------------------
# Fiscal year helpers
# ---------------------------------------------------------------------------

def get_fiscal_year_details(fiscal_year=None, company=None):
	"""
	Get fiscal year details.
	Note: Fiscal Year is a global doctype (not company-specific),
	so we don't filter by company here.
	"""
	if fiscal_year:
		fy = frappe.db.get_value("Fiscal Year", fiscal_year, ["name", "year_start_date", "year_end_date"], as_dict=True)
	else:
		# First try to get the current fiscal year (overlapping today's date)
		filters = {"year_start_date": ["<=", getdate()], "year_end_date": [">=", getdate()]}
		
		fy = frappe.db.get_value(
			"Fiscal Year",
			filters,
			["name", "year_start_date", "year_end_date"],
			as_dict=True,
		)
		
		# If no current FY, get the latest one
		if not fy:
			fy = frappe.db.get_value(
				"Fiscal Year", 
				{}, 
				["name", "year_start_date", "year_end_date"], 
				as_dict=True, 
				order_by="year_end_date desc"
			)
	
	if not fy:
		frappe.throw(_("Please set up a Fiscal Year first."))
	return fy.name, fy.year_start_date, fy.year_end_date


def get_prior_fiscal_year(current_start_date):
	if not current_start_date:
		return None, None, None
	fy = frappe.db.get_value(
		"Fiscal Year",
		{"year_end_date": ["<", current_start_date]},
		["name", "year_start_date", "year_end_date"],
		as_dict=True,
		order_by="year_end_date desc",
	)
	if not fy:
		return None, None, None
	return fy.name, fy.year_start_date, fy.year_end_date


def get_quarter_dates(fy_start, fy_end):
	if not fy_start:
		return [(None, None)] * 4
	start = getdate(fy_start)
	quarters = []
	for i in range(4):
		q_start = add_months(start, i * 3)
		q_end = add_months(start, i * 3 + 3)
		q_end = add_months(q_end, 0)
		from datetime import timedelta
		q_end = q_end - timedelta(days=1)
		quarters.append((q_start, q_end))
	return quarters


def get_first_company():
	return frappe.db.get_value("Company", {}, "name", order_by="creation asc")


# ---------------------------------------------------------------------------
# Currency helper — every company can run on a different currency, so the
# symbol shown across the whole page is resolved per-company, never hardcoded.
# For QAR (Qatari Riyal), make sure your Currency doctype has the QAR code
# and the desired symbol (ر.ق or QAR).
# ---------------------------------------------------------------------------

def get_currency_symbol(company):
	"""Return the currency code (e.g. QAR, USD, KES) for the selected company."""
	currency = frappe.get_cached_value("Company", company, "default_currency") if company else None
	if not currency:
		currency = frappe.db.get_default("currency")
	return currency or DEFAULT_CURRENCY_SYMBOL


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def fmt_m(value_in_millions, symbol=DEFAULT_CURRENCY_SYMBOL):
	"""value_in_millions is already scaled to $M by get_gl_total/get_gl_monthly."""
	v = flt(value_in_millions)
	if abs(v) >= 1:
		return "{}{:.1f}M".format(symbol, v)
	return "{}{:.0f}K".format(symbol, v * 1000)


def fmt_accounting(value_in_millions, symbol=DEFAULT_CURRENCY_SYMBOL):
	"""Same scale as fmt_m, but negative values are wrapped in parentheses —
	the standard way expenses/losses are shown on a P&L statement."""
	v = flt(value_in_millions)
	if v < 0:
		if abs(v) >= 1:
			return "({}{:.1f}M)".format(symbol, abs(v))
		return "({}{:.0f}K)".format(symbol, abs(v) * 1000)
	return fmt_m(v, symbol)


def fmt_delta(diff_in_millions, symbol=DEFAULT_CURRENCY_SYMBOL):
	v = flt(diff_in_millions)
	sign = "+" if v >= 0 else "-"
	v = abs(v)
	if v >= 1:
		return "{}{}{:.1f}M".format(sign, symbol, v)
	return "{}{}{:.0f}K".format(sign, symbol, v * 1000)


def pct_change(current, prior):
	if not prior:
		return 0
	return round((current - prior) / abs(prior) * 100, 1)


def pct_of(part, whole):
	if not whole:
		return 0
	return (part / whole) * 100


# ---------------------------------------------------------------------------
# STATEMENTS TAB — entry point
# ---------------------------------------------------------------------------
# Fully data-driven from PL Category / PL Category Group + the
# custom_pl_report_category link field on Account. See the CONFIG note near
# the top of the file for the 2 eligibility conditions and the calc-field
# sequence.
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_pl_statement_data(company=None, fiscal_year=None):
	"""Data for the 'Statements' tab — a category-wise P&L."""

	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		company = get_first_company()
	if not company:
		frappe.throw(_("No company found. Please set up a Company first."))

	fy_name, fy_start, fy_end = get_fiscal_year_details(fiscal_year, company)
	py_name, py_start, py_end = get_prior_fiscal_year(fy_start)
	currency_symbol = get_currency_symbol(company)

	categories = get_pl_categories(company)

	if not categories:
		return {
			"company": company,
			"fiscal_year": fy_name,
			"prior_fiscal_year": py_name,
			"currency_symbol": currency_symbol,
			"rows": [],
			# Accounts that qualify for the P&L (account_type != "Group" AND
			# report_type == "Profit and Loss") but have no PL Category
			# mapped yet — purely informational, does not affect any totals.
			"missing_accounts": get_missing_pl_accounts(company),
			"empty_message": _(
				"No Profit and Loss accounts are mapped to a PL Category yet. "
				"Set the \"custom_pl_report_category\" field on your accounts "
				"first (only non-Group accounts with Report Type = "
				"\"Profit and Loss\" are picked up)."
			),
		}

	all_accounts = [acc for cat in categories.values() for acc in cat["accounts"]]

	cy_totals = get_account_signed_totals(all_accounts, company, fy_start, fy_end)
	py_totals = get_account_signed_totals(all_accounts, company, py_start, py_end) if py_start else {}

	for cat in categories.values():
		cat["cy"] = sum(cy_totals.get(acc, 0) for acc in cat["accounts"]) / 1_000_000
		cat["py"] = sum(py_totals.get(acc, 0) for acc in cat["accounts"]) / 1_000_000

	# Group categories -> ordered by each PL Category Group's own "sort"
	# field (set directly on the PL Category Group doctype); categories
	# inside a group are ordered by their own "sort" value.
	groups = {}
	for cat in categories.values():
		bucket = groups.setdefault(cat["group"], {"sort": cat["group_sort"], "categories": []})
		bucket["categories"].append(cat)

	group_order = sorted(groups.keys(), key=lambda g: groups[g]["sort"])

	rows = []
	running_cy = 0
	running_py = 0
	
	# Track values for summary cards
	summary_data = {
		"revenue_cy": 0,
		"revenue_py": 0,
		"gross_profit_cy": 0,
		"gross_profit_py": 0,
		"operating_income_cy": 0,
		"operating_income_py": 0,
		"net_income_cy": 0,
		"net_income_py": 0,
	}

	for group_name in group_order:
		group_categories = sorted(groups[group_name]["categories"], key=lambda c: c["sort"])

		rows.append({"row_type": "group_header", "label": group_name})

		group_cy = 0
		group_py = 0

		for cat in group_categories:
			rows.append(build_statement_row("line", cat["label"], cat["cy"], cat["py"], currency_symbol))
			group_cy += cat["cy"]
			group_py += cat["py"]

		rows.append(
			build_statement_row("total", _("Total {0}").format(group_name), group_cy, group_py, currency_symbol)
		)

		running_cy += group_cy
		running_py += group_py

		# Capture summary data
		if group_name == "Revenue":
			summary_data["revenue_cy"] = group_cy
			summary_data["revenue_py"] = group_py
		elif group_name == "Cost of Revenue":
			summary_data["gross_profit_cy"] = running_cy
			summary_data["gross_profit_py"] = running_py

		calc_label = STATEMENT_CALC_AFTER_GROUP.get(group_name)

		# Income Before Tax always sits right after "Other Income & Expense".
		# Net Income is NOT decided here — it's added once, unconditionally,
		# after every group has been processed (see below), so it's never
		# gated on the "Taxes" group existing or having data.
		if group_name == STATEMENT_PRETAX_GROUP:
			calc_label = "Income Before Tax"

		if calc_label:
			rows.append(build_statement_row("calculated", _(calc_label), running_cy, running_py, currency_symbol))
			
			# Capture summary data for calculated fields
			if "Gross Profit" in calc_label:
				summary_data["gross_profit_cy"] = running_cy
				summary_data["gross_profit_py"] = running_py
			elif "Operating Income" in calc_label:
				summary_data["operating_income_cy"] = running_cy
				summary_data["operating_income_py"] = running_py

	# Net Income is always the very last row on the statement — the running
	# total of every group above it (Revenue, Cost of Revenue, Operating
	# Expenses, Other Income & Expense, Taxes, and anything else mapped),
	# added here unconditionally rather than tied to any specific group.
	rows.append(build_statement_row("calculated", _("Net Income"), running_cy, running_py, currency_symbol))
	summary_data["net_income_cy"] = running_cy
	summary_data["net_income_py"] = running_py

	return {
		"company": company,
		"fiscal_year": fy_name,
		"prior_fiscal_year": py_name,
		"currency_symbol": currency_symbol,
		"rows": rows,
		"summary_cards": build_summary_cards(summary_data, currency_symbol),
		# Accounts that qualify for the P&L (account_type != "Group" AND
		# report_type == "Profit and Loss") but have no PL Category mapped
		# yet, so they're silently missing from the rows above. Purely
		# informational — does not feed into any of the totals/calculations.
		"missing_accounts": get_missing_pl_accounts(company),
	}


def build_summary_cards(summary_data, currency_symbol):
	"""Build summary card data for Revenue, Gross Profit, Operating Income, Net Income"""
	return [
		{
			"label": _("Revenue"),
			"icon": "dollar-sign",
			"value_fmt": fmt_accounting(summary_data["revenue_cy"], currency_symbol),
			"prior_value_fmt": fmt_accounting(summary_data["revenue_py"], currency_symbol),
			"change_pct": pct_change(summary_data["revenue_cy"], summary_data["revenue_py"]),
			"change_pct_class": "fo-badge-up" if summary_data["revenue_cy"] >= summary_data["revenue_py"] else "fo-badge-down",
		},
		{
			"label": _("Gross Profit"),
			"icon": "pie-chart",
			"value_fmt": fmt_accounting(summary_data["gross_profit_cy"], currency_symbol),
			"prior_value_fmt": fmt_accounting(summary_data["gross_profit_py"], currency_symbol),
			"change_pct": pct_change(summary_data["gross_profit_cy"], summary_data["gross_profit_py"]),
			"change_pct_class": "fo-badge-up" if summary_data["gross_profit_cy"] >= summary_data["gross_profit_py"] else "fo-badge-down",
		},
		{
			"label": _("Operating Income"),
			"icon": "bar-chart-2",
			"value_fmt": fmt_accounting(summary_data["operating_income_cy"], currency_symbol),
			"prior_value_fmt": fmt_accounting(summary_data["operating_income_py"], currency_symbol),
			"change_pct": pct_change(summary_data["operating_income_cy"], summary_data["operating_income_py"]),
			"change_pct_class": "fo-badge-up" if summary_data["operating_income_cy"] >= summary_data["operating_income_py"] else "fo-badge-down",
		},
		{
			"label": _("Net Income"),
			"icon": "credit-card",
			"value_fmt": fmt_accounting(summary_data["net_income_cy"], currency_symbol),
			"prior_value_fmt": fmt_accounting(summary_data["net_income_py"], currency_symbol),
			"change_pct": pct_change(summary_data["net_income_cy"], summary_data["net_income_py"]),
			"change_pct_class": "fo-badge-up" if summary_data["net_income_cy"] >= summary_data["net_income_py"] else "fo-badge-down",
		},
	]


def build_statement_row(row_type, label, cy, py, currency_symbol):
	return {
		"row_type": row_type,
		"label": label,
		"cy_fmt": fmt_accounting(cy, currency_symbol),
		"py_fmt": fmt_accounting(py, currency_symbol),
		"var_amt_fmt": fmt_delta(cy - py, currency_symbol),
		"var_pct": pct_change(cy, py),
		"is_negative": cy < 0,
	}


def get_pl_categories(company):
	"""All PL Categories that have at least one eligible account mapped to
	them on this company. Eligibility (exactly as specified):
		account_type != "Group"  AND  report_type == "Profit and Loss"
	"""

	rows = frappe.db.sql(
		"""
		SELECT
			acc.name AS account,
			cat.name AS category,
			cat.name1 AS category_label,
			cat.sort AS sort,
			cat.category_group AS category_group,
			plg.sort AS group_sort
		FROM `tabAccount` acc
		INNER JOIN `tabPL Category` cat ON cat.name = acc.custom_pl_report_category
		LEFT JOIN `tabPL Category Group` plg ON plg.name = cat.category_group
		WHERE acc.company = %(company)s
			AND IFNULL(acc.account_type, '') != 'Group'
			AND acc.report_type = 'Profit and Loss'
			AND IFNULL(acc.custom_pl_report_category, '') != ''
		""",
		{"company": company},
		as_dict=True,
	)

	categories = {}
	for row in rows:
		cat = categories.setdefault(row.category, {
			"label": row.category_label or row.category,
			"sort": flt(row.sort) or 0,
			"group": row.category_group or _("Other"),
			# Groups without an explicit sort sink to the bottom instead of
			# jumping to the top.
			"group_sort": flt(row.group_sort) if row.group_sort is not None else 9999,
			"accounts": [],
		})
		cat["accounts"].append(row.account)

	return categories


def get_missing_pl_accounts(company):
	"""Accounts that qualify for the P&L — exactly the same 2 conditions
	used by get_pl_categories() / the client's own check:

		account_type != "Group"  AND  report_type == "Profit and Loss"

	— but that have NO custom_pl_report_category set, and are therefore
	silently excluded from the Statements tab above. Returned grouped by
	parent account purely for display at the bottom of the page.

	This is read-only/informational: it does not touch, feed, or alter any
	of the totals, sums, or calculated rows built elsewhere in this file.
	"""

	if not company:
		return []

	rows = frappe.db.sql(
		"""
		SELECT acc.name, acc.account_name, acc.parent_account, acc.root_type
		FROM `tabAccount` acc
		WHERE acc.company = %(company)s
			AND IFNULL(acc.account_type, '') != 'Group'
			AND acc.report_type = 'Profit and Loss'
			AND IFNULL(acc.custom_pl_report_category, '') = ''
		ORDER BY acc.parent_account, acc.name
		""",
		{"company": company},
		as_dict=True,
	)

	groups = {}
	for r in rows:
		key = r.parent_account or _("Ungrouped")
		groups.setdefault(key, []).append({
			"name": r.name,
			"account_name": r.account_name or r.name,
			"root_type": r.root_type,
		})

	return [{"group": g, "accounts": accs} for g, accs in groups.items()]


def get_account_signed_totals(accounts, company, from_date, to_date):
	"""{account: credit - debit} for the given date range. Positive means an
	income-normal balance, negative an expense-normal balance — this signed
	convention is what makes every running P&L total a plain addition.

	Only submitted (docstatus = 1) entries are counted, and Period Closing
	Voucher entries are excluded — matching the client's query — since
	they'd otherwise double-count what the year's category totals already
	reflect."""

	if not accounts or not from_date or not to_date:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT gle.account, SUM(gle.credit) AS credit, SUM(gle.debit) AS debit
		FROM `tabGL Entry` gle
		WHERE gle.company = %(company)s
			AND gle.account IN %(accounts)s
			AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND gle.docstatus = 1
			AND gle.is_cancelled = 0
			AND gle.voucher_type NOT IN %(excluded_voucher_types)s
		GROUP BY gle.account
		""",
		{
			"company": company,
			"accounts": accounts,
			"from_date": from_date,
			"to_date": to_date,
			"excluded_voucher_types": STATEMENT_EXCLUDED_VOUCHER_TYPES,
		},
		as_dict=True,
	)

	return {r.account: flt(r.credit) - flt(r.debit) for r in rows}


def group_has_gl_activity(accounts, company, from_date, to_date):
	"""True if any of the given accounts has at least one submitted GL Entry
	in the period (same filters as get_account_signed_totals)."""

	if not accounts or not from_date or not to_date:
		return False

	hit = frappe.db.sql(
		"""
		SELECT 1
		FROM `tabGL Entry` gle
		WHERE gle.company = %(company)s
			AND gle.account IN %(accounts)s
			AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND gle.docstatus = 1
			AND gle.is_cancelled = 0
			AND gle.voucher_type NOT IN %(excluded_voucher_types)s
		LIMIT 1
		""",
		{
			"company": company,
			"accounts": accounts,
			"from_date": from_date,
			"to_date": to_date,
			"excluded_voucher_types": STATEMENT_EXCLUDED_VOUCHER_TYPES,
		},
	)
	return bool(hit)