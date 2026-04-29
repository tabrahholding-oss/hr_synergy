
from itertools import groupby

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate

from hrms.hr.doctype.leave_allocation.leave_allocation import get_previous_allocation
from hrms.hr.doctype.leave_application.leave_application import (
	get_leave_balance_on,
	get_leaves_for_period,
)

Filters = frappe._dict


def execute(filters: Filters | None = None) -> tuple:
	if filters.to_date <= filters.from_date:
		frappe.throw(_('"From Date" can not be greater than or equal to "To Date"'))

	columns = get_columns()
	data = get_data(filters)
	# charts = get_chart_data(data, filters)
	return columns, data, None


def get_columns() -> list[dict]:
	return [
		# {"label": _("Leave Type"),"fieldtype": "Link","fieldname": "leave_type","width": 200,"options": "Leave Type",},
		{"label": _("Employee"),"fieldtype": "Link","fieldname": "employee","width": 100,"options": "Employee",},
		{"label": _("Employee Name"),"fieldtype": "Dynamic Link","fieldname": "employee_name","width": 100,"options": "employee",},
                {"label": "Date of Joining", "fieldname": "date_of_joining", "fieldtype": "Date", "width": 120},
                {"label": "Accural Basis (BASIC + HRA)", "fieldname": "accural_basis", "fieldtype": "Currency", "width": 85},
		{"label": _("Opening Balance"),"fieldtype": "float","fieldname": "opening_balance","width": 150,},
         {"label": "Opening Amount", "fieldname": "opening_amount", "fieldtype": "Currency", "width": 85},
		{"label": _("New Leave(s) Allocated"),"fieldname": "leaves_allocated","width": 200,},
		{"label": _("Leave(s) Taken"),"fieldtype": "float","fieldname": "leaves_taken","width": 150,},
		# {"label": _("Lea 150,ve(s) Expired"),"fieldtype": "float","fieldname": "leaves_expired","width":},
        {"label": "Leave Taken Amount", "fieldname": "leave_taken_amount", "fieldtype": "Currency", "width": 85},
        {"label": "Monthly Accural Days", "fieldname": "monthly_accural_days", "fieldtype": "Float", "width": 85},
        {"label": "Monthly Accural Amount", "fieldname": "monthly_accural_amount", "fieldtype": "Currency", "width": 85},
        {"label": "Closing Balance Days", "fieldname": "closing_balance", "fieldtype": "Float", "width": 120},
        {"label": "Closing Balance Amount", "fieldname": "closing_balance_amount", "fieldtype": "Currency", "width": 120},
		# {"label": _("Closing Balance"),"fieldtype": "float","fieldname": "closing_balance","width": 150,},

	]


def get_data(filters: Filters) -> list:
    leave_types = get_leave_types()
    active_employees = get_employees(filters)

    precision = cint(frappe.db.get_single_value("System Settings", "float_precision"))
    consolidate_leave_types = len(active_employees) > 1 and filters.consolidate_leave_types

    data = []

    for employee in active_employees:
        accural_basis = (
            flt(frappe.get_value("Salary Structure Assignment", {"employee": employee.name}, "base"))
            + flt(frappe.get_value("Salary Structure Assignment", {"employee": employee.name}, "custom_hra"))
        )
        amount_per_day = flt(accural_basis) / 30 if accural_basis else 0

        leave_alloc = 0
        leave_taken = 0
        closing_balance = 0

        # Initialize defaults
        opening = 0
        leaves_taken = 0
        expired_leaves = 0
        new_allocation = 0

        for leave_type in leave_types:
            if leave_type != "Annual Leave (Encashment)":
                continue

            if consolidate_leave_types:
                data.append({"leave_type": leave_type})

            leaves_taken = (
                get_leaves_for_period(employee.name, leave_type, filters.from_date, filters.to_date) * -1
            )

            new_allocation, expired_leaves, carry_forwarded_leaves = get_allocated_and_expired_leaves(
                filters.from_date, filters.to_date, employee.name, leave_type
            )
            opening = get_opening_balance(employee.name, leave_type, filters, carry_forwarded_leaves)

            leave_alloc += flt(new_allocation, precision)
            leave_taken += flt(leaves_taken, precision)
            closing_balance += new_allocation + opening - (expired_leaves + leaves_taken)

        accrued_days_per_month = flt(leave_alloc) / 12 if leave_alloc else 0
        new_leave_allocated = min(accrued_days_per_month, 2.5)

        monthly_accural_days = leave_alloc if leave_alloc < 2.5 else 2.5
        monthly_accural_amount = amount_per_day * monthly_accural_days

        leave_taken_amount = amount_per_day * leave_taken
        opening_amount = amount_per_day * opening
        closing_balance_amount = closing_balance * amount_per_day if closing_balance else 0

        data.append({
			"leave_type": "Annual Leave",
			"employee": employee.name,
			"employee_name": employee.employee_name,
		    "accural_basis": accural_basis,
		    "date_of_joining": employee.date_of_joining,
			"leaves_allocated": flt(new_allocation, precision),
			"leaves_expired": flt(expired_leaves, precision),
			"opening_balance": flt(opening, precision),
			"leaves_taken": flt(leaves_taken, precision),
			"closing_balance": flt(closing_balance, precision),
            "opening_days": opening,
            "opening_amount": opening_amount,
            "leave_taken": leave_taken,
            "leave_taken_amount": leave_taken_amount,
            "monthly_accural_days": monthly_accural_days,
            "monthly_accural_amount": monthly_accural_amount,
            "closing_balance_amount": closing_balance_amount,
        })

    return data

def get_leave_types() -> list[str]:
	LeaveType = frappe.qb.DocType("Leave Type")
	return (frappe.qb.from_(LeaveType).select(LeaveType.name).orderby(LeaveType.name)).run(pluck="name")


def get_employees(filters: Filters) -> list[dict]:
	Employee = frappe.qb.DocType("Employee")
	query = frappe.qb.from_(Employee).select(
		Employee.name,
		Employee.employee_name,
		Employee.department,
		Employee.date_of_joining,
	)

	for field in ["company", "department"]:
		if filters.get(field):
			query = query.where(getattr(Employee, field) == filters.get(field))

	if filters.get("employee"):
		query = query.where(Employee.name == filters.get("employee"))

	if filters.get("employee_status"):
		query = query.where(Employee.status == filters.get("employee_status"))

	return query.run(as_dict=True)


def get_opening_balance(
	employee: str, leave_type: str, filters: Filters, carry_forwarded_leaves: float
) -> float:
	# allocation boundary condition
	# opening balance is the closing leave balance 1 day before the filter start date
	opening_balance_date = add_days(filters.from_date, -1)
	allocation = get_previous_allocation(filters.from_date, leave_type, employee)

	if (
		allocation
		and allocation.get("to_date")
		and opening_balance_date
		and getdate(allocation.get("to_date")) == getdate(opening_balance_date)
	):
		# if opening balance date is same as the previous allocation's expiry
		# then opening balance should only consider carry forwarded leaves
		opening_balance = carry_forwarded_leaves
	else:
		# else directly get leave balance on the previous day
		opening_balance = get_leave_balance_on(employee, leave_type, opening_balance_date)

	return opening_balance


def get_allocated_and_expired_leaves(
	from_date: str, to_date: str, employee: str, leave_type: str
) -> tuple[float, float, float]:
	new_allocation = 0
	expired_leaves = 0
	carry_forwarded_leaves = 0

	records = get_leave_ledger_entries(from_date, to_date, employee, leave_type)

	for record in records:
		# new allocation records with `is_expired=1` are created when leave expires
		# these new records should not be considered, else it leads to negative leave balance
		if record.is_expired:
			continue

		if record.to_date < getdate(to_date):
			# leave allocations ending before to_date, reduce leaves taken within that period
			# since they are already used, they won't expire
			expired_leaves += record.leaves
			leaves_for_period = get_leaves_for_period(employee, leave_type, record.from_date, record.to_date)
			expired_leaves -= min(abs(leaves_for_period), record.leaves)

		if record.from_date >= getdate(from_date):
			if record.is_carry_forward:
				carry_forwarded_leaves += record.leaves
			else:
				new_allocation += record.leaves

	return new_allocation, expired_leaves, carry_forwarded_leaves


def get_leave_ledger_entries(from_date: str, to_date: str, employee: str, leave_type: str) -> list[dict]:
	ledger = frappe.qb.DocType("Leave Ledger Entry")
	return (
		frappe.qb.from_(ledger)
		.select(
			ledger.employee,
			ledger.leave_type,
			ledger.from_date,
			ledger.to_date,
			ledger.leaves,
			ledger.transaction_name,
			ledger.transaction_type,
			ledger.is_carry_forward,
			ledger.is_expired,
		)
		.where(
			(ledger.docstatus == 1)
			& (ledger.transaction_type == "Leave Allocation")
			& (ledger.employee == employee)
			& (ledger.leave_type == leave_type)
			& (
				(ledger.from_date[from_date:to_date])
				| (ledger.to_date[from_date:to_date])
				| ((ledger.from_date < from_date) & (ledger.to_date > to_date))
			)
		)
	).run(as_dict=True)


# def get_chart_data(data: list, filters: Filters) -> dict:
# 	labels = []
# 	datasets = []
# 	employee_data = data

# 	if not data:
# 		return None

# 	if data and filters.employee:
# 		get_dataset_for_chart(employee_data, datasets, labels)

# 	chart = {
# 		"data": {"labels": labels, "datasets": datasets},
# 		"type": "bar",
# 		"colors": ["#456789", "#EE8888", "#7E77BF"],
# 	}

# 	return chart


def get_dataset_for_chart(employee_data: list, datasets: list, labels: list) -> list:
	leaves = []
	employee_data = sorted(employee_data, key=lambda k: k["employee_name"])

	for key, group in groupby(employee_data, lambda x: x["employee_name"]):
		for grp in group:
			if grp.closing_balance:
				leaves.append(
					frappe._dict({"leave_type": grp.leave_type, "closing_balance": grp.closing_balance})
				)

		if leaves:
			labels.append(key)

	for leave in leaves:
		datasets.append({"name": leave.leave_type, "values": [leave.closing_balance]})
