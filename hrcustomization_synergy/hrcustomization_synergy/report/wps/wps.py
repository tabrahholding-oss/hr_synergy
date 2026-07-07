# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate
from datetime import datetime
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import calculate_salary_breakdowns


def execute(filters=None):
	columns = get_columns(filters or {})
	data = get_record(filters or {})
	return columns, data


def get_record(filters):
	data = []

	ss = frappe.qb.DocType("Salary Slip")
	emp = frappe.qb.DocType("Employee")

	query = (
		frappe.qb.from_(ss)
		.inner_join(emp).on(emp.name == ss.employee)
		.select(
			emp.custom_qatar_id.as_('qid_no'),
			emp.bank_ac_no.as_('bank_ac_no'),
			emp.iban.as_('iban'),
			emp.bank_name.as_('bank_short_name'),
			ss.name.as_('name'),
			ss.employee.as_('employee'),
			ss.employee_name.as_('employee_name'),
			ss.payroll_frequency.as_('payroll_frequency'),
			ss.payment_days.as_('total_working_days'),
			ss.net_pay.as_('net_salary'),
			ss.total_deduction.as_('total_deduction'),
			ss.gross_pay.as_('gross_pay')
		)
		.where(ss.docstatus == 1)
	)

	# Filters
	if filters.get('from_date'):
		query = query.where(ss.start_date >= filters.get('from_date'))
	if filters.get('to_date'):
		query = query.where(ss.end_date <= filters.get('to_date'))
	if filters.get('department'):
		query = query.where(ss.department == filters.get('department'))
	if filters.get('from_range'):
		query = query.where(ss.net_pay >= filters.get('from_range'))
	if filters.get('to_range'):
		query = query.where(ss.net_pay <= filters.get('to_range'))
	if filters.get('employees'):
		query = query.where(ss.employee.isin(filters.get('employees')))

	data = query.run(as_dict=True)

	# ---- NEW: fetch Basic (abbr "B") default_amount for all fetched slips in one shot ----
	base_map = {}
	employee_base_map = {}
	if data:
		sd = frappe.qb.DocType("Salary Detail")
		slip_names = [r["name"] for r in data]
		employee_names = [r["employee"] for r in data]

		# Match either abbr == "B" or salary_component == "Basic"
		cond_basic = (sd.abbr == "B") | (sd.salary_component == "Basic")

		base_rows = (
			frappe.qb.from_(sd)
			.select(sd.parent, sd.default_amount, sd.amount)
			.where(
				(sd.parent.isin(slip_names))
				& (sd.parenttype == "Salary Slip")
				& cond_basic
			)
		).run(as_dict=True)

		for br in base_rows:
			# Prefer default_amount; fall back to amount; else 0.0
			base_map[br["parent"]] = br.get("default_amount") or br.get("amount") or 0.0

		# Fetch base salary from Salary Structure Assignment as fallback
		ssa = frappe.qb.DocType("Salary Structure Assignment")
		ssa_rows = (
			frappe.qb.from_(ssa)
			.select(ssa.employee, ssa.base)
			.where(ssa.employee.isin(employee_names))
			.orderby(ssa.from_date, order=frappe.qb.desc)
		).run(as_dict=True)

		# Create a map of employee to their latest base salary
		for ssa_row in ssa_rows:
			if ssa_row["employee"] not in employee_base_map:
				employee_base_map[ssa_row["employee"]] = ssa_row.get("base") or 0.0
	# ---- END NEW ----

	# Month label + totals
	if filters.get("from_date"):
		month_name = getdate(filters.from_date).strftime("%B")
		year = getdate(filters.from_date).strftime("%Y")
		salary_month = getdate(filters.from_date).strftime("%Y%m")
	else:
		# Safe fallbacks if no date filter was provided
		today = datetime.today()
		month_name = today.strftime("%B")
		year = today.strftime("%Y")
		salary_month = today.strftime("%Y%m")

	total_records = len(data)
	total_salary = sum((row.get("net_salary", 0) or 0) for row in data)

	# Build each row
	idx = 0
	for row in data:
		idx += 1

		if row.get("payroll_frequency") == "Monthly":
			row['salary_frequency'] = "M"

		# Ensure integer working days (report expects integer)
		if row.get("total_working_days") is not None:
			try:
				row["total_working_days"] = int(row.get("total_working_days"))
			except Exception:
				pass

		# Existing dynamic calc for other fields (kept)
		salary_breakdown = calculate_salary_breakdowns(row)

		# ---- NEW: override base_salary from Salary Detail (Basic / abbr "B") ----
		# Priority: 1. Salary Detail from slip, 2. Salary Structure Assignment, 3. salary_breakdown calculation
		base_from_slip = base_map.get(row["name"])
		base_from_structure = employee_base_map.get(row["employee"])

		if base_from_slip is not None:
			effective_base = base_from_slip
		elif base_from_structure is not None:
			effective_base = base_from_structure
		else:
			effective_base = salary_breakdown.get("base_salary", 0.0)
		# ---- END NEW ----

		data_to_append = {
			"sno": idx,
			"base_salary": effective_base,
			"housing_allowance": salary_breakdown.get("housing_allowance", 0.0),
			"food_allowance": salary_breakdown.get("food_allowance", 0.0),
			"transportation_allowance": salary_breakdown.get("transportation_allowance", 0.0),
			"ot_allowance": salary_breakdown.get("ot_allowance", 0.0),
			"extra_income": salary_breakdown.get("extra_income", 0.0),
			"extra_hours": 0.0,
			"extra_field_1": 0.0,
			"extra_field_2": 0.0,
			"payment_type": "Normal Payment",
			"comments": f"Salary For {month_name} {year}",
		}
		row.update(data_to_append)

		# Deduction reason
		row["deduction_reason_code"] = 4 if (row.get("total_deduction") or 0) else 0

	# Header records
	today = datetime.today()
	now = datetime.now()

	# Fetch sponsor details if sponsor filter is provided
	sponsor_data = {}
	if filters.get('sponsor'):
		sponsor_data = frappe.db.get_value(
			'Sponsor',
			filters.get('sponsor'),
			['employer_eid', 'payer_eid', 'payer_bank_short_name', 'payer_iban'],
			as_dict=True
		) or {}

	headers = {
		"sno": sponsor_data.get('employer_eid') or frappe.db.get_single_value('WPS Settings', 'employer_eid'),
		"qid_no": today.strftime("%Y%m%d"),
		"visa_id": now.strftime("%H%M"),
		"employee_name": sponsor_data.get('payer_eid') or frappe.db.get_single_value('WPS Settings', 'payer_eid'),
		"bank_short_name": frappe.db.get_single_value('WPS Settings', 'payer_qid'),
		"iban": sponsor_data.get('payer_bank_short_name') or frappe.db.get_single_value('WPS Settings', 'payer_bank_short_name'),
		"salary_frequency": sponsor_data.get('payer_iban') or frappe.db.get_single_value('WPS Settings', 'payer_iban'),
		"total_working_days": salary_month,
		"net_salary": total_salary,
		"base_salary": total_records,
		"extra_hours": "",
		"extra_income": "",
		"total_deduction": "",
		"payment_type": "",
		"comments": ""
	}
	data.insert(0, headers)

	title_headers = {
		"sno": "Record Sequence",
		"qid_no": "Employee QID",
		"visa_id": "Employee Visa ID",
		"employee_name": "Employee Name",
		"bank_short_name": "Employee Bank Short Name",
		"iban": "Employee Account",
		"salary_frequency": "Salary Frequency",
		"total_working_days": "Number of Working days",
		"net_salary": "Net Salary",
		"base_salary": "Basic Salary",
		"extra_hours": "Extra hours",
		"extra_income": "Extra income",
		"total_deduction": "Deductions",
		"payment_type": "Payment Type",
		"comments": "Notes / Comments",
	}
	data.insert(1, title_headers)

	return data


def get_columns(filters):
	# All 15 columns for report display
	# CSV export will filter first 2 rows to show only first 10 columns via get_data_for_csv() in JS
	columns = [
		{"label": _("Employer EID"), "fieldname": "sno", "fieldtype": "Data", "width": 150},
		{"label": _("File Creation Date"), "fieldname": "qid_no", "fieldtype": "Data", "width": 150},
		{"label": _("File Creation Time"), "fieldname": "visa_id", "fieldtype": "Data", "width": 180},
		{"label": _("Payer EID"), "fieldname": "employee_name", "fieldtype": "Data", "width": 180},
		{"label": _("Payer QID"), "fieldname": "bank_short_name", "fieldtype": "Data", "width": 150},
		{"label": _("Payer Bank Short Name"), "fieldname": "iban", "fieldtype": "Data", "width": 150},
		{"label": _("Payer IBAN"), "fieldname": "salary_frequency", "fieldtype": "Data", "width": 150},
		{"label": _("Salary Year and Month"), "fieldname": "total_working_days", "fieldtype": "Data", "width": 150},
		{"label": _("Total Salaries"), "fieldname": "net_salary", "fieldtype": "Data", "width": 150},
		{"label": _("Total Records"), "fieldname": "base_salary", "fieldtype": "Data", "width": 150},
		{"label": _("Extra Hours"), "fieldname": "extra_hours", "fieldtype": "Data", "width": 150},
		{"label": _("Extra Income"), "fieldname": "extra_income", "fieldtype": "Data", "width": 150},
		{"label": _("Total Deduction"), "fieldname": "total_deduction", "fieldtype": "Data", "width": 150},
		{"label": _("Payment Type"), "fieldname": "payment_type", "fieldtype": "Data", "width": 150},
		{"label": _("Comments"), "fieldname": "comments", "fieldtype": "Data", "width": 200},
	]
	return columns
