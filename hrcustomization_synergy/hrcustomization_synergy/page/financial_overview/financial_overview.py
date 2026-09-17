# financial_overview.py
# ---------------------------------------------------------------------------
# Backend for the "Financial Overview" dashboard page.
# Pulls live numbers from GL Entry (for revenue/profit) and PL Category
# mapping (for revenue breakdown).
#
# IMPORTANT — please review the CONFIG section below and adjust the
# item-group / account-type mapping to match your actual Chart of Accounts.
# ---------------------------------------------------------------------------

import calendar
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import flt, add_months, getdate

# ---------------------------------------------------------------------------
# CONFIG — adjust to match your setup
# ---------------------------------------------------------------------------

# Account types (kept for backwards compatibility with old helpers)
COGS_ACCOUNT_TYPE = "Cost of Goods Sold"
DEPRECIATION_ACCOUNT_TYPE = "Depreciation"
NON_OPERATING_ACCOUNT_TYPES = ["Tax", "Depreciation"]

COLORS = ["#1c6b4a", "#e3a627", "#d9824f", "#7a9e8f", "#b0763f"]

DEFAULT_CURRENCY_SYMBOL = "QAR"

# ---------------------------------------------------------------------------
# EBIT / EBITDA — PL Category based (same mapping as Statements tab)
# ---------------------------------------------------------------------------
EBITDA_EBIT_PL_GROUPS = ["Revenue", "Cost of Revenue", "Operating Expenses"]
EBITDA_DNA_PL_CATEGORY = "Depreciation & Amortization"

# ---------------------------------------------------------------------------
# STATEMENTS TAB — CONFIG
# ---------------------------------------------------------------------------
STATEMENT_CALC_AFTER_GROUP = {
	"Cost of Revenue": "Gross Profit",
	"Operating Expenses": "Operating Income (EBIT)",
}

STATEMENT_PRETAX_GROUP = "Other Income & Expense"
STATEMENT_TAX_GROUP = "Taxes"

STATEMENT_EXCLUDED_VOUCHER_TYPES = ["Period Closing Voucher"]


# ---------------------------------------------------------------------------
# Entry point — Overview tab
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_dashboard_data(company=None, fiscal_year=None):
	"""Main API called from financial_overview.js (Overview tab)."""

	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		company = get_first_company()

	if not company:
		frappe.throw(_("No company found. Please set up a Company first."))

	fy_name, fy_start, fy_end = get_fiscal_year_details(fiscal_year, company)
	py_name, py_start, py_end = get_prior_fiscal_year(fy_start)

	currency_symbol = get_currency_symbol(company)

	gl_from = py_start or fy_start
	gl_rows = load_gl_data(company, gl_from, fy_end)

	categories = get_pl_categories(company)

	hero_metrics_cy = compute_pl_category_metrics(categories, company, fy_start, fy_end)
	hero_metrics_py = compute_pl_category_metrics(categories, company, py_start, py_end)

	revenue_cy = hero_metrics_cy["revenue"]
	revenue_py = hero_metrics_py["revenue"]
	gross_profit_cy = hero_metrics_cy["gross_profit"]
	net_income_cy = hero_metrics_cy["net_income"]

	stat_cards = build_pl_stat_cards(
		categories, company, fy_start, fy_end, py_start, py_end, currency_symbol
	)
	stat_cards.append(
		build_ebit_stat_card(company, fy_start, fy_end, py_start, py_end, currency_symbol)
	)

	# Revenue breakdown donut — ab PL Category Revenue group se
	revenue_breakdown = get_revenue_breakdown_from_pl(
		company, fy_start, fy_end, currency_symbol
	)

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
# PL Category based stat cards (Gross Profit / Operating Income / Net Income)
# ---------------------------------------------------------------------------

def compute_pl_category_metrics(categories, company, start, end):
	empty = {
		"revenue": 0,
		"cost_of_revenue": 0,
		"operating_expenses": 0,
		"gross_profit": 0,
		"operating_income": 0,
		"net_income": 0,
	}

	if not categories or not start or not end:
		return empty

	all_accounts = [acc for cat in categories.values() for acc in cat["accounts"]]
	totals = get_account_signed_totals(all_accounts, company, start, end)

	group_sums = {}
	net_income_total = 0

	for cat in categories.values():
		cat_total = sum(totals.get(acc, 0) for acc in cat["accounts"])
		group_sums[cat["group"]] = group_sums.get(cat["group"], 0) + cat_total
		net_income_total += cat_total

	revenue = group_sums.get("Revenue", 0) / 1_000_000
	cost_of_revenue = group_sums.get("Cost of Revenue", 0) / 1_000_000
	operating_expenses = group_sums.get("Operating Expenses", 0) / 1_000_000
	net_income = net_income_total / 1_000_000

	gross_profit = revenue + cost_of_revenue
	operating_income = gross_profit + operating_expenses

	return {
		"revenue": revenue,
		"cost_of_revenue": cost_of_revenue,
		"operating_expenses": operating_expenses,
		"gross_profit": gross_profit,
		"operating_income": operating_income,
		"net_income": net_income,
	}


def build_pl_stat_cards(categories, company, fy_start, fy_end, py_start, py_end, currency_symbol):
	q_dates_cy = get_quarter_dates(fy_start, fy_end)
	q_dates_py = get_quarter_dates(py_start, py_end) if py_start else [(None, None)] * 4

	cy_quarterly = [compute_pl_category_metrics(categories, company, s, e) for s, e in q_dates_cy]
	py_quarterly = (
		[compute_pl_category_metrics(categories, company, s, e) for s, e in q_dates_py]
		if py_start
		else [None] * 4
	)
	py_total = compute_pl_category_metrics(categories, company, py_start, py_end) if py_start else None

	card_defs = [
		("gross_profit", "dollar-sign", _("Gross Profit"), "gross_profit"),
		("operating_income", "bar-chart-2", _("Operating Income"), "operating_income"),
		("net_income", "credit-card", _("Net Income"), "net_income"),
	]

	cards = []
	for key, icon, label, metric_key in card_defs:
		quarters = []
		for i in range(4):
			value_cy = cy_quarterly[i][metric_key]
			value_py = py_quarterly[i][metric_key] if py_start else 0

			quarters.append({
				"label": "Q%d" % (i + 1),
				"value": round(value_cy, 3),
				"change_pct": pct_change(value_cy, value_py),
			})

		total_cy = sum(q["value"] for q in quarters)
		total_py_metric = py_total[metric_key] if py_start else 0

		max_abs = max([abs(q["value"]) for q in quarters] + [0.001])
		for q in quarters:
			q["bar_pct"] = round(max(6, abs(q["value"]) / max_abs * 100), 1)
			q["is_down"] = q["value"] < 0 or q["change_pct"] < 0

		cards.append({
			"key": key,
			"icon": icon,
			"label": label,
			"value_fmt": fmt_m(total_cy, currency_symbol),
			"prior_value_fmt": fmt_m(total_py_metric, currency_symbol),
			"change_pct": pct_change(total_cy, total_py_metric),
			"quarters": quarters,
		})

	return cards


# ---------------------------------------------------------------------------
# EBIT / EBITDA
# ---------------------------------------------------------------------------

def get_ebit_and_dna(company, from_date, to_date):
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


def build_ebit_stat_card(company, fy_start, fy_end, py_start, py_end, currency_symbol):
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
		"key": "ebit",
		"icon": "pie-chart",
		"label": _("EBITDA"),
		"value_fmt": fmt_m(total_cy, currency_symbol),
		"prior_value_fmt": fmt_m(total_py, currency_symbol),
		"change_pct": pct_change(total_cy, total_py),
		"quarters": quarters,
	}


# ---------------------------------------------------------------------------
# Revenue breakdown — PL Category "Revenue" group se
# ---------------------------------------------------------------------------

def get_revenue_breakdown_from_pl(company, fy_start, fy_end, currency_symbol):
	"""Revenue breakdown donut — Statements tab ke Revenue group ki categories
	se. Har category ek slice hai. Sub-items me us category ke top accounts."""

	categories = get_pl_categories(company)

	revenue_cats = [
		cat for cat in categories.values()
		if (cat["group"] or "").lower() == "revenue"
	]
	revenue_cats_sorted = sorted(revenue_cats, key=lambda c: c["sort"])

	if not revenue_cats_sorted:
		return []

	all_rev_accounts = [acc for cat in revenue_cats_sorted for acc in cat["accounts"]]
	cy_totals = get_account_signed_totals(all_rev_accounts, company, fy_start, fy_end)

	cat_amounts = []
	for cat in revenue_cats_sorted:
		amt = sum(cy_totals.get(acc, 0) for acc in cat["accounts"])
		amt = abs(amt)
		if amt > 0:
			cat_amounts.append({
				"label": cat["label"],
				"amount": amt,
				"accounts": cat["accounts"],
			})

	total = sum(c["amount"] for c in cat_amounts) or 1

	result = []
	for idx, item in enumerate(cat_amounts):
		acc_amounts = []
		for acc in item["accounts"]:
			a = abs(cy_totals.get(acc, 0))
			if a > 0:
				acc_amounts.append({"label": acc, "amount": a})
		acc_amounts.sort(key=lambda x: x["amount"], reverse=True)
		sub_top = acc_amounts[:4]
		sub_total = sum(s["amount"] for s in sub_top) or 1

		result.append({
			"label": item["label"],
			"value_fmt": fmt_m(item["amount"] / 1_000_000, currency_symbol),
			"pct": round(item["amount"] / total * 100, 1),
			"color": COLORS[idx % len(COLORS)],
			"sub_items": [
				{
					"label": s["label"],
					"value_fmt": fmt_m(s["amount"] / 1_000_000, currency_symbol),
					"bar_pct": round(s["amount"] / sub_total * 100, 1),
				}
				for s in sub_top
			],
		})

	return result


# ---------------------------------------------------------------------------
# Monthly trend (Overview tab sparkline)
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


# ---------------------------------------------------------------------------
# Fiscal year helpers
# ---------------------------------------------------------------------------

def get_fiscal_year_details(fiscal_year=None, company=None):
	if fiscal_year:
		fy = frappe.db.get_value(
			"Fiscal Year", fiscal_year,
			["name", "year_start_date", "year_end_date"], as_dict=True
		)
	else:
		filters = {"year_start_date": ["<=", getdate()], "year_end_date": [">=", getdate()]}
		fy = frappe.db.get_value(
			"Fiscal Year", filters,
			["name", "year_start_date", "year_end_date"], as_dict=True
		)
		if not fy:
			fy = frappe.db.get_value(
				"Fiscal Year", {},
				["name", "year_start_date", "year_end_date"],
				as_dict=True, order_by="year_end_date desc"
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
		q_end = add_months(start, i * 3 + 3) - timedelta(days=1)
		quarters.append((q_start, q_end))
	return quarters


def get_first_company():
	return frappe.db.get_value("Company", {}, "name", order_by="creation asc")


def get_currency_symbol(company):
	currency = frappe.get_cached_value("Company", company, "default_currency") if company else None
	if not currency:
		currency = frappe.db.get_default("currency")
	return currency or DEFAULT_CURRENCY_SYMBOL


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def fmt_m(value_in_millions, symbol=DEFAULT_CURRENCY_SYMBOL):
	v = flt(value_in_millions)
	if abs(v) >= 1:
		return "{}{:.1f}M".format(symbol, v)
	return "{}{:.0f}K".format(symbol, v * 1000)


def fmt_accounting(value_in_millions, symbol=DEFAULT_CURRENCY_SYMBOL):
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

	groups = {}
	for cat in categories.values():
		bucket = groups.setdefault(cat["group"], {"sort": cat["group_sort"], "categories": []})
		bucket["categories"].append(cat)

	group_order = sorted(groups.keys(), key=lambda g: groups[g]["sort"])

	rows = []
	running_cy = 0
	running_py = 0

	summary_data = {
		"revenue_cy": 0, "revenue_py": 0,
		"gross_profit_cy": 0, "gross_profit_py": 0,
		"operating_income_cy": 0, "operating_income_py": 0,
		"net_income_cy": 0, "net_income_py": 0,
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

		if group_name == "Revenue":
			summary_data["revenue_cy"] = group_cy
			summary_data["revenue_py"] = group_py
		elif group_name == "Cost of Revenue":
			summary_data["gross_profit_cy"] = running_cy
			summary_data["gross_profit_py"] = running_py

		calc_label = STATEMENT_CALC_AFTER_GROUP.get(group_name)

		if group_name == STATEMENT_PRETAX_GROUP:
			calc_label = "Income Before Tax"

		if calc_label:
			rows.append(build_statement_row("calculated", _(calc_label), running_cy, running_py, currency_symbol))

			if "Gross Profit" in calc_label:
				summary_data["gross_profit_cy"] = running_cy
				summary_data["gross_profit_py"] = running_py
			elif "Operating Income" in calc_label:
				summary_data["operating_income_cy"] = running_cy
				summary_data["operating_income_py"] = running_py

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
		"missing_accounts": get_missing_pl_accounts(company),
	}


def build_summary_cards(summary_data, currency_symbol):
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
			AND acc.is_group = 0
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
			"group_sort": flt(row.group_sort) if row.group_sort is not None else 9999,
			"accounts": [],
		})
		cat["accounts"].append(row.account)

	return categories


def get_missing_pl_accounts(company):
	if not company:
		return []

	rows = frappe.db.sql(
		"""
		SELECT acc.name, acc.account_name, acc.account_number, acc.root_type
		FROM `tabAccount` acc
		WHERE acc.company = %(company)s
			AND acc.is_group = 0
			AND acc.report_type = 'Profit and Loss'
			AND IFNULL(acc.custom_pl_report_category, '') = ''
		ORDER BY acc.account_name
		""",
		{"company": company},
		as_dict=True,
	)

	return [
		{
			"name": r.name,
			"account_name": (
				"{0} - {1}".format(r.account_number, r.account_name)
				if r.account_number else (r.account_name or r.name)
			),
			"root_type": r.root_type,
		}
		for r in rows
	]


def get_account_signed_totals(accounts, company, from_date, to_date):
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


# ===========================================================================
# TRENDS TAB — entry point
# ===========================================================================
# Quarterly Revenue (stacked bars by PL Category inside "Revenue" group)
# + Margin cards (Gross / Operating / Net / EBITDA) + Margin Trends chart.

@frappe.whitelist()
def get_trends_data(company=None, fiscal_year=None):
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

	# ---- Quarterly revenue by category (stacked bars) --------------------
	revenue_cats = [
		cat for cat in categories.values()
		if (cat["group"] or "").lower() == "revenue"
	]
	revenue_cats_sorted = sorted(revenue_cats, key=lambda c: c["sort"])

	all_rev_accounts = [acc for cat in revenue_cats_sorted for acc in cat["accounts"]]

	q_dates_cy = get_quarter_dates(fy_start, fy_end)
	q_dates_py = get_quarter_dates(py_start, py_end) if py_start else [(None, None)] * 4

	quarterly_bars = []
	for i in range(4):
		q_start_cy, q_end_cy = q_dates_cy[i]
		q_start_py, q_end_py = q_dates_py[i]

		cy_totals = get_account_signed_totals(
			all_rev_accounts, company, q_start_cy, q_end_cy
		) if all_rev_accounts else {}

		py_totals = get_account_signed_totals(
			all_rev_accounts, company, q_start_py, q_end_py
		) if (all_rev_accounts and py_start) else {}

		cat_values = []
		for cat in revenue_cats_sorted:
			cy_val = sum(cy_totals.get(acc, 0) for acc in cat["accounts"]) / 1_000_000
			py_val = sum(py_totals.get(acc, 0) for acc in cat["accounts"]) / 1_000_000
			cy_val = abs(cy_val)
			py_val = abs(py_val)
			cat_values.append({
				"label": cat["label"],
				"cy": round(cy_val, 3),
				"py": round(py_val, 3),
			})

		cy_total = sum(c["cy"] for c in cat_values)
		py_total = sum(c["py"] for c in cat_values)

		quarterly_bars.append({
			"label": "Q%d" % (i + 1),
			"categories": cat_values,
			"cy_total": round(cy_total, 3),
			"py_total": round(py_total, 3),
			"change_pct": pct_change(cy_total, py_total),
		})

	max_val = max([q["cy_total"] for q in quarterly_bars] + [0.001])

	color_map = {}
	for idx, cat in enumerate(revenue_cats_sorted):
		color_map[cat["label"]] = COLORS[idx % len(COLORS)]

	margin_cards = compute_margin_cards(
		categories, company, fy_start, fy_end, py_start, py_end, currency_symbol
	)

	margin_trends = []
	for i in range(4):
		q_start, q_end = q_dates_cy[i]
		metrics = compute_pl_category_metrics(categories, company, q_start, q_end)
		ebit, dna = get_ebit_and_dna(company, q_start, q_end)
		ebitda = ebit - dna

		rev = metrics["revenue"]
		margin_trends.append({
			"label": "Q%d" % (i + 1),
			"gross_margin": round(pct_of(metrics["gross_profit"], rev), 1),
			"operating_margin": round(pct_of(metrics["operating_income"], rev), 1),
			"net_margin": round(pct_of(metrics["net_income"], rev), 1),
			"ebitda_margin": round(pct_of(ebitda, rev), 1),
		})

	return {
		"company": company,
		"fiscal_year": fy_name,
		"prior_fiscal_year": py_name,
		"currency_symbol": currency_symbol,
		"quarterly_bars": quarterly_bars,
		"category_colors": color_map,
		"category_labels": [cat["label"] for cat in revenue_cats_sorted],
		"max_val": round(max_val, 3),
		"margin_cards": margin_cards,
		"margin_trends": margin_trends,
	}


def compute_margin_cards(categories, company, fy_start, fy_end, py_start, py_end, currency_symbol):
	cy = compute_pl_category_metrics(categories, company, fy_start, fy_end)
	py = compute_pl_category_metrics(categories, company, py_start, py_end) if py_start else {
		"revenue": 0, "gross_profit": 0, "operating_income": 0, "net_income": 0
	}

	ebit_cy, dna_cy = get_ebit_and_dna(company, fy_start, fy_end)
	ebitda_cy = ebit_cy - dna_cy

	if py_start:
		ebit_py, dna_py = get_ebit_and_dna(company, py_start, py_end)
		ebitda_py = ebit_py - dna_py
	else:
		ebitda_py = 0

	def margin(part, whole):
		return round(pct_of(part, whole), 1)

	def pp_diff(cy_m, py_m):
		return round(cy_m - py_m, 1)

	gm_cy = margin(cy["gross_profit"], cy["revenue"])
	gm_py = margin(py["gross_profit"], py["revenue"])
	om_cy = margin(cy["operating_income"], cy["revenue"])
	om_py = margin(py["operating_income"], py["revenue"])
	nm_cy = margin(cy["net_income"], cy["revenue"])
	nm_py = margin(py["net_income"], py["revenue"])
	eb_cy = margin(ebitda_cy, cy["revenue"])
	eb_py = margin(ebitda_py, py["revenue"])

	return [
		{
			"label": _("Gross Margin"),
			"value_pct": gm_cy,
			"prior_pct": gm_py,
			"diff_pp": pp_diff(gm_cy, gm_py),
			"color": "#1c6b4a",
		},
		{
			"label": _("Operating Margin"),
			"value_pct": om_cy,
			"prior_pct": om_py,
			"diff_pp": pp_diff(om_cy, om_py),
			"color": "#e3a627",
		},
		{
			"label": _("Net Margin"),
			"value_pct": nm_cy,
			"prior_pct": nm_py,
			"diff_pp": pp_diff(nm_cy, nm_py),
			"color": "#d9824f",
		},
		{
			"label": _("EBITDA Margin"),
			"value_pct": eb_cy,
			"prior_pct": eb_py,
			"diff_pp": pp_diff(eb_cy, eb_py),
			"color": "#1e3a5f",
		},
	]


# ===========================================================================
# COSTS & COMPARISON TAB — entry point
# ===========================================================================

@frappe.whitelist()
def get_costs_data(company=None, fiscal_year=None):
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

	cy_metrics = compute_pl_category_metrics(categories, company, fy_start, fy_end)
	py_metrics = compute_pl_category_metrics(categories, company, py_start, py_end) if py_start else {
		"revenue": 0, "cost_of_revenue": 0, "operating_expenses": 0,
		"gross_profit": 0, "operating_income": 0, "net_income": 0
	}

	revenue_cy = cy_metrics["revenue"]
	revenue_py = py_metrics["revenue"]

	q_dates_cy = get_quarter_dates(fy_start, fy_end)
	q_dates_py = get_quarter_dates(py_start, py_end) if py_start else [(None, None)] * 4

	left_cards = []
	card_defs = [
		("revenue", _("Revenue"), "#1c6b4a", "revenue"),
		("gross_profit", _("Gross Profit"), "#1c6b4a", "gross_profit"),
		("operating_income", _("Operating Income"), "#e3a627", "operating_income"),
		("net_income", _("Net Income"), "#d9824f", "net_income"),
	]

	for key, label, color, metric_key in card_defs:
		sparkline_cy = []
		sparkline_py = []
		for i in range(4):
			s, e = q_dates_cy[i]
			m = compute_pl_category_metrics(categories, company, s, e)
			sparkline_cy.append(round(m[metric_key], 3))

			if py_start:
				ps, pe = q_dates_py[i]
				pm = compute_pl_category_metrics(categories, company, ps, pe)
				sparkline_py.append(round(pm[metric_key], 3))
			else:
				sparkline_py.append(0)

		total_cy = cy_metrics[metric_key]
		total_py = py_metrics[metric_key] if py_start else 0

		left_cards.append({
			"key": key,
			"label": label,
			"color": color,
			"value_fmt": fmt_accounting(total_cy, currency_symbol),
			"prior_value_fmt": fmt_accounting(total_py, currency_symbol),
			"change_pct": pct_change(total_cy, total_py),
			"sparkline_cy": sparkline_cy,
			"sparkline_py": sparkline_py,
		})

	# ---- OpEx rows -------------------------------------------------------
	# PL Category Group ka naam har DB me alag ho sakta hai — case-insensitive
	# aur flexible match use karo, plus fallback bhi rakho.
	def _is_opex_group(name):
		n = (name or "").strip().lower()
		if not n:
			return False
		# Explicit variants
		if n in ("operating expenses", "operating expense", "opex",
				 "operating cost", "operating costs"):
			return True
		# Fuzzy — "operating" + "expense" dono ho
		if "operating" in n and "expense" in n:
			return True
		# "expense" only (but not "cost of revenue")
		if "expense" in n and "cost" not in n and "revenue" not in n:
			return True
		return False

	opex_cats = [
		cat for cat in categories.values()
		if _is_opex_group(cat.get("group"))
	]

	opex_cats_sorted = sorted(opex_cats, key=lambda c: c["sort"])

	all_opex_accounts = [acc for cat in opex_cats_sorted for acc in cat["accounts"]]
	cy_opex_totals = get_account_signed_totals(all_opex_accounts, company, fy_start, fy_end) if all_opex_accounts else {}
	py_opex_totals = get_account_signed_totals(all_opex_accounts, company, py_start, py_end) if (all_opex_accounts and py_start) else {}

	opex_rows = []
	opex_total_cy = 0
	opex_total_py = 0
	for idx, cat in enumerate(opex_cats_sorted):
		cy_val = sum(cy_opex_totals.get(acc, 0) for acc in cat["accounts"]) / 1_000_000
		py_val = sum(py_opex_totals.get(acc, 0) for acc in cat["accounts"]) / 1_000_000
		cy_abs = abs(cy_val)
		py_abs = abs(py_val)
		opex_total_cy += cy_abs
		opex_total_py += py_abs
		opex_rows.append({
			"label": cat["label"],
			"cy": round(cy_val, 3),
			"py": round(py_val, 3),
			"cy_abs_fmt": fmt_m(cy_abs, currency_symbol),
			"py_abs_fmt": fmt_m(py_abs, currency_symbol),
			"change_pct": pct_change(cy_abs, py_abs),
			"color": COLORS[idx % len(COLORS)],
		})

	max_opex = max([abs(r["cy"]) for r in opex_rows] + [0.001])
	for r in opex_rows:
		r["bar_pct"] = round(max(8, abs(r["cy"]) / max_opex * 100), 1)

	# ---- Bottom 3 cards --------------------------------------------------
	cost_of_revenue_cy = abs(cy_metrics["cost_of_revenue"])
	cost_of_revenue_py = abs(py_metrics["cost_of_revenue"])

	total_opex_cy = abs(cy_metrics["operating_expenses"])
	total_opex_py = abs(py_metrics["operating_expenses"])

	opex_ratio_cy = round(pct_of(total_opex_cy, revenue_cy), 1) if revenue_cy else 0
	opex_ratio_py = round(pct_of(total_opex_py, revenue_py), 1) if revenue_py else 0

	bottom_cards = [
		{
			"label": _("Cost of Revenue"),
			"value_fmt": fmt_m(cost_of_revenue_cy, currency_symbol),
			"prior_value_fmt": fmt_m(cost_of_revenue_py, currency_symbol),
			"change_pct": pct_change(cost_of_revenue_cy, cost_of_revenue_py),
		},
		{
			"label": _("Total OpEx"),
			"value_fmt": fmt_m(total_opex_cy, currency_symbol),
			"prior_value_fmt": fmt_m(total_opex_py, currency_symbol),
			"change_pct": pct_change(total_opex_cy, total_opex_py),
		},
		{
			"label": _("OpEx Ratio"),
			"value_fmt": "{:.1f}%".format(opex_ratio_cy),
			"prior_value_fmt": "{:.1f}%".format(opex_ratio_py),
			"change_pct": round(opex_ratio_cy - opex_ratio_py, 1),
		},
	]

	return {
		"company": company,
		"fiscal_year": fy_name,
		"prior_fiscal_year": py_name,
		"currency_symbol": currency_symbol,
		"left_cards": left_cards,
		"opex_rows": opex_rows,
		"opex_total_cy_fmt": fmt_m(opex_total_cy, currency_symbol),
		"opex_total_py_fmt": fmt_m(opex_total_py, currency_symbol),
		"opex_total_change_pct": pct_change(opex_total_cy, opex_total_py),
		"bottom_cards": bottom_cards,
	}