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


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_dashboard_data(company=None, fiscal_year=None):
	"""Main API called from financial_overview.js"""

	company = company or frappe.defaults.get_user_default("Company") or get_first_company()
	if not company:
		frappe.throw(_("No company found. Please set up a Company first."))

	fy_name, fy_start, fy_end = get_fiscal_year_details(fiscal_year)
	py_name, py_start, py_end = get_prior_fiscal_year(fy_start)

	# --- top-level revenue -------------------------------------------------
	revenue_cy = get_gl_total(company, fy_start, fy_end, root_type="Income")
	revenue_py = get_gl_total(company, py_start, py_end, root_type="Income") if py_start else 0

	# --- profitability metrics ---------------------------------------------
	cogs_cy = get_gl_total(company, fy_start, fy_end, root_type="Expense", account_type=COGS_ACCOUNT_TYPE)
	cogs_py = get_gl_total(company, py_start, py_end, root_type="Expense", account_type=COGS_ACCOUNT_TYPE) if py_start else 0

	total_expense_cy = get_gl_total(company, fy_start, fy_end, root_type="Expense")
	total_expense_py = get_gl_total(company, py_start, py_end, root_type="Expense") if py_start else 0

	depreciation_cy = get_gl_total(company, fy_start, fy_end, root_type="Expense", account_type=DEPRECIATION_ACCOUNT_TYPE)
	depreciation_py = get_gl_total(company, py_start, py_end, root_type="Expense", account_type=DEPRECIATION_ACCOUNT_TYPE) if py_start else 0

	operating_expense_cy = get_gl_total(
		company, fy_start, fy_end, root_type="Expense", exclude_account_types=[COGS_ACCOUNT_TYPE] + NON_OPERATING_ACCOUNT_TYPES
	)
	operating_expense_py = (
		get_gl_total(company, py_start, py_end, root_type="Expense", exclude_account_types=[COGS_ACCOUNT_TYPE] + NON_OPERATING_ACCOUNT_TYPES)
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
		build_stat_card("gross_profit", "dollar-sign", _("Gross Profit"), company, fy_start, fy_end, py_start, py_end,
			root_type="Expense", account_type=COGS_ACCOUNT_TYPE, is_profit_metric=True, revenue_based=True),
		build_stat_card("operating_income", "bar-chart-2", _("Operating Income"), company, fy_start, fy_end, py_start, py_end,
			root_type="Expense", exclude_account_types=[COGS_ACCOUNT_TYPE] + NON_OPERATING_ACCOUNT_TYPES, is_profit_metric=True, revenue_based=True, subtract_from="gross_profit"),
		build_stat_card("net_income", "credit-card", _("Net Income"), company, fy_start, fy_end, py_start, py_end,
			root_type="Expense", is_profit_metric=True, revenue_based=True),
		build_stat_card("ebitda", "pie-chart", _("EBITDA"), company, fy_start, fy_end, py_start, py_end,
			root_type="Expense", exclude_account_types=NON_OPERATING_ACCOUNT_TYPES, is_profit_metric=True, revenue_based=True, add_back=DEPRECIATION_ACCOUNT_TYPE),
	]

	# --- revenue breakdown (donut) ------------------------------------------
	revenue_breakdown = get_revenue_breakdown(company, fy_start, fy_end)

	# --- monthly trend -------------------------------------------------------
	trend = get_monthly_trend(company, fy_start, fy_end, py_start, py_end)

	return {
		"company": company,
		"fiscal_year": fy_name,
		"prior_fiscal_year": py_name,
		"total_revenue": {
			"value_fmt": fmt_m(revenue_cy),
			"change_pct": pct_change(revenue_cy, revenue_py),
			"vs_amount_fmt": fmt_delta(revenue_cy - revenue_py),
			"gross_margin": round(pct_of(gross_profit_cy, revenue_cy), 1),
			"net_margin": round(pct_of(net_income_cy, revenue_cy), 1),
		},
		"stat_cards": stat_cards,
		"revenue_breakdown": revenue_breakdown,
		"revenue_total_fmt": fmt_m(revenue_cy),
		"trend": trend,
	}


# ---------------------------------------------------------------------------
# Stat card (quarterly bars + YoY tooltip data) builder
# ---------------------------------------------------------------------------

def build_stat_card(key, icon, label, company, fy_start, fy_end, py_start, py_end,
	root_type=None, account_type=None, exclude_account_types=None,
	is_profit_metric=False, revenue_based=False, subtract_from=None, add_back=None):

	quarters = []
	q_dates_cy = get_quarter_dates(fy_start, fy_end)
	q_dates_py = get_quarter_dates(py_start, py_end) if py_start else [None, None, None, None]

	for i in range(4):
		q_start, q_end = q_dates_cy[i]
		value_cy = compute_metric(company, q_start, q_end, root_type, account_type, exclude_account_types, add_back, revenue_based)

		if py_start:
			pq_start, pq_end = q_dates_py[i]
			value_py = compute_metric(company, pq_start, pq_end, root_type, account_type, exclude_account_types, add_back, revenue_based)
		else:
			value_py = 0

		quarters.append({
			"label": "Q%d" % (i + 1),
			"value": round(value_cy, 3),
			"change_pct": pct_change(value_cy, value_py),
		})

	total_cy = sum(q["value"] for q in quarters)
	total_py_metric = compute_metric(company, py_start, py_end, root_type, account_type, exclude_account_types, add_back, revenue_based) if py_start else 0

	max_abs = max([abs(q["value"]) for q in quarters] + [0.001])
	for q in quarters:
		q["bar_pct"] = round(max(6, abs(q["value"]) / max_abs * 100), 1)
		q["is_down"] = q["value"] < 0 or q["change_pct"] < 0

	return {
		"key": key,
		"icon": icon,
		"label": label,
		"value_fmt": fmt_m(total_cy),
		"prior_value_fmt": fmt_m(total_py_metric),
		"change_pct": pct_change(total_cy, total_py_metric),
		"quarters": quarters,
	}


def compute_metric(company, start, end, root_type, account_type, exclude_account_types, add_back, revenue_based):
	if not start or not end:
		return 0
	revenue = get_gl_total(company, start, end, root_type="Income")
	expense = get_gl_total(company, start, end, root_type=root_type, account_type=account_type, exclude_account_types=exclude_account_types)
	value = (revenue - expense) if revenue_based else expense
	if add_back:
		value += get_gl_total(company, start, end, root_type="Expense", account_type=add_back)
	return value


# ---------------------------------------------------------------------------
# Revenue breakdown (donut + sub-item hover breakdown)
# ---------------------------------------------------------------------------

def get_revenue_breakdown(company, from_date, to_date):
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
			"value_fmt": fmt_m(amount / 1_000_000),
			"pct": round(amount / total * 100, 1),
			"color": COLORS[i % len(COLORS)],
			"sub_items": [
				{
					"label": r.item_group,
					"value_fmt": fmt_m(flt(r.amount) / 1_000_000),
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

def get_monthly_trend(company, fy_start, fy_end, py_start, py_end):
	cy_monthly = get_gl_monthly(company, fy_start, fy_end, root_type="Income")
	py_monthly = get_gl_monthly(company, py_start, py_end, root_type="Income") if py_start else {}

	months = []
	current = []
	prior = []
	start = getdate(fy_start)
	for i in range(12):
		m_date = add_months(start, i)
		key = m_date.month
		months.append(calendar.month_abbr[key])
		cy_val = round(cy_monthly.get(key, 0), 3)
		py_val = round(py_monthly.get(key, 0), 3)
		current.append({
			"month": calendar.month_abbr[key],
			"value": cy_val,
			"prior": py_val,
			"change_pct": pct_change(cy_val, py_val),
			"change_amount_fmt": fmt_delta(cy_val - py_val),
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

def get_gl_total(company, from_date, to_date, root_type=None, account_type=None, exclude_account_types=None):
	if not company or not from_date or not to_date:
		return 0

	conditions = [
		"gle.company = %(company)s",
		"gle.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		"gle.is_cancelled = 0",
	]
	values = {"company": company, "from_date": from_date, "to_date": to_date}

	if root_type:
		conditions.append("acc.root_type = %(root_type)s")
		values["root_type"] = root_type
	if account_type:
		conditions.append("acc.account_type = %(account_type)s")
		values["account_type"] = account_type
	if exclude_account_types:
		conditions.append("(acc.account_type IS NULL OR acc.account_type NOT IN %(exclude_types)s)")
		values["exclude_types"] = tuple(exclude_account_types)

	sign_expr = "gle.credit - gle.debit" if root_type == "Income" else "gle.debit - gle.credit"

	result = frappe.db.sql(
		f"""
		SELECT SUM({sign_expr})
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON gle.account = acc.name
		WHERE {" AND ".join(conditions)}
		""",
		values,
	)
	return flt(result[0][0]) / 1_000_000 if result and result[0][0] else 0  # returned in $M


def get_gl_monthly(company, from_date, to_date, root_type=None, account_type=None, exclude_account_types=None):
	if not company or not from_date or not to_date:
		return {}

	conditions = [
		"gle.company = %(company)s",
		"gle.posting_date BETWEEN %(from_date)s AND %(to_date)s",
		"gle.is_cancelled = 0",
	]
	values = {"company": company, "from_date": from_date, "to_date": to_date}

	if root_type:
		conditions.append("acc.root_type = %(root_type)s")
		values["root_type"] = root_type
	if account_type:
		conditions.append("acc.account_type = %(account_type)s")
		values["account_type"] = account_type
	if exclude_account_types:
		conditions.append("(acc.account_type IS NULL OR acc.account_type NOT IN %(exclude_types)s)")
		values["exclude_types"] = tuple(exclude_account_types)

	sign_expr = "gle.credit - gle.debit" if root_type == "Income" else "gle.debit - gle.credit"

	rows = frappe.db.sql(
		f"""
		SELECT MONTH(gle.posting_date) AS month, SUM({sign_expr}) AS amount
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON gle.account = acc.name
		WHERE {" AND ".join(conditions)}
		GROUP BY MONTH(gle.posting_date)
		""",
		values,
		as_dict=True,
	)
	return {int(r.month): flt(r.amount) / 1_000_000 for r in rows}  # in $M


# ---------------------------------------------------------------------------
# Fiscal year helpers
# ---------------------------------------------------------------------------

def get_fiscal_year_details(fiscal_year=None):
	if fiscal_year:
		fy = frappe.db.get_value("Fiscal Year", fiscal_year, ["name", "year_start_date", "year_end_date"], as_dict=True)
	else:
		fy = frappe.db.get_value(
			"Fiscal Year",
			{"year_start_date": ["<=", getdate()], "year_end_date": [">=", getdate()]},
			["name", "year_start_date", "year_end_date"],
			as_dict=True,
		)
		if not fy:
			fy = frappe.db.get_value(
				"Fiscal Year", {}, ["name", "year_start_date", "year_end_date"], as_dict=True, order_by="year_end_date desc"
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
# Formatting helpers
# ---------------------------------------------------------------------------

def fmt_m(value_in_millions):
	"""value_in_millions is already scaled to $M by get_gl_total/get_gl_monthly."""
	v = flt(value_in_millions)
	if abs(v) >= 1:
		return "${:.1f}M".format(v)
	return "${:.0f}K".format(v * 1000)


def fmt_delta(diff_in_millions):
	v = flt(diff_in_millions)
	sign = "+" if v >= 0 else "-"
	v = abs(v)
	if v >= 1:
		return "{}${:.1f}M".format(sign, v)
	return "{}${:.0f}K".format(sign, v * 1000)


def pct_change(current, prior):
	if not prior:
		return 0
	return round((current - prior) / abs(prior) * 100, 1)


def pct_of(part, whole):
	if not whole:
		return 0
	return (part / whole) * 100