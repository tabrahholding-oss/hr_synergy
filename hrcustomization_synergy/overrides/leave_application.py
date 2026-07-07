import frappe
from frappe.utils import flt, getdate, nowdate
from datetime import date


def validate_leave_application(doc, method=None):
    calculate_forecasted_leave(doc)


def calculate_forecasted_leave(doc):

    if (
        not doc.employee
        or not doc.leave_type
        or not doc.from_date
        or doc.leave_type != "Annual Leave"
    ):
        doc.custom_forcasted_leave = 0
        return

    leave_balance = get_leave_balance(
        doc.employee,
        doc.leave_type,
        doc.from_date
    )

    employee = frappe.db.get_value(
        "Employee",
        doc.employee,
        ["date_of_joining", "relieving_date"],
        as_dict=True
    )

    if not employee or not employee.date_of_joining:
        doc.custom_forcasted_leave = round(leave_balance, 2)
        return

    joining_date = getdate(employee.date_of_joining)

    today = getdate(nowdate())

    years_of_service = today.year - joining_date.year

    if (
        (today.month, today.day)
        < (joining_date.month, joining_date.day)
    ):
        years_of_service -= 1

    yearly_leave = 30 if years_of_service > 5 else 21

    first_day_of_month = date(
        today.year,
        today.month,
        1
    )

    selected_date = getdate(doc.from_date)

    calculated_days = (
        selected_date - first_day_of_month
    ).days

    if calculated_days < 0:
        calculated_days = 0

    forecasting_days = (
        yearly_leave / 365
    ) * calculated_days

    doc.custom_forcasted_leave = round(
        leave_balance + forecasting_days,
        2
    )


def get_leave_balance(employee, leave_type, target_date):

    allocation = frappe.db.get_all(
        "Leave Allocation",
        filters={
            "employee": employee,
            "leave_type": leave_type,
            "docstatus": 1,
            "from_date": ["<=", target_date],
            "to_date": [">=", target_date],
        },
        fields=[
            "name",
            "from_date",
            "to_date",
            "total_leaves_allocated",
            "carry_forwarded_leaves_count",
        ],
        order_by="from_date desc",
        limit=1,
    )

    if not allocation:
        return 0

    allocation = allocation[0]

    ledger_entries = frappe.db.get_all(
        "Leave Ledger Entry",
        filters={
            "employee": employee,
            "leave_type": leave_type,
            "docstatus": 1,
            "is_expired": 0,
            "is_lwp": 0,
        },
        fields=[
            "leaves",
            "transaction_type",
            "transaction_name",
            "from_date",
            "to_date",
            "is_carry_forward",
        ],
        limit=500,
    )

    leave_balance = 0

    for row in ledger_entries:

        if getdate(row.from_date) > getdate(target_date):
            continue

        if getdate(row.to_date) < getdate(allocation.from_date):
            continue

        leaves = flt(row.leaves)

        if row.transaction_type == "Leave Allocation":
            leave_balance += leaves

        elif row.transaction_type == "Leave Adjustment":
            leave_balance += leaves

        elif row.transaction_type == "Leave Application":
            leave_balance += leaves

    return leave_balance



@frappe.whitelist()
def get_forecasted_leave_balance(employee, leave_type, target_date):
	"""
	Calculate leave balance (Allocation + Adjustment + Application) for the
	given employee/leave_type as of target_date.

	ignore_permissions=True is critical here — is k baghair jab employee
	apne user se login ho kar ye method call karega to Leave Allocation /
	Leave Ledger Entry doctype ki user-level ya field-level permissions
	kuch records/fields ko strip kar dengi, aur balance galat (kam) aayega
	— jaisa Administrator vs Employee login me farq dikh raha tha.
	"""
	if not employee or not leave_type or not target_date:
		return 0

	target_date = getdate(target_date)

	allocations = frappe.get_all(
		"Leave Allocation",
		filters={
			"employee": employee,
			"leave_type": leave_type,
			"docstatus": 1,
			"from_date": ["<=", target_date],
			"to_date": [">=", target_date],
		},
		fields=["name", "from_date", "to_date", "total_leaves_allocated", "carry_forwarded_leaves_count"],
		order_by="from_date desc",
		limit_page_length=1,
		ignore_permissions=True,
	)

	if not allocations:
		return 0

	allocation = allocations[0]

	ledger_entries = frappe.get_all(
		"Leave Ledger Entry",
		filters={
			"employee": employee,
			"leave_type": leave_type,
			"docstatus": 1,
			"is_expired": 0,
			"is_lwp": 0,
			"from_date": ["<=", target_date],
			"to_date": [">=", allocation.from_date],
			"transaction_type": ["in", ["Leave Allocation", "Leave Application", "Leave Adjustment"]],
		},
		fields=["leaves", "transaction_type", "transaction_name", "from_date", "to_date", "is_carry_forward"],
		order_by="from_date asc",
		limit_page_length=500,
		ignore_permissions=True,
	)

	leave_balance = 0.0

	for row in ledger_entries:
		leaves = flt(row.leaves)

		# Leave Allocation / Adjustment / Application sab ko add kar rahe hain
		# kyunki Application ki entries already negative hoti hain ledger me.
		if row.transaction_type in ("Leave Allocation", "Leave Adjustment", "Leave Application"):
			leave_balance += leaves

	return leave_balance


@frappe.whitelist()
def get_employee_joining_info(employee):
	"""Fetch date_of_joining / relieving_date bypassing permission stripping too."""
	if not employee:
		return {}

	emp = frappe.get_all(
		"Employee",
		filters={"name": employee},
		fields=["date_of_joining", "relieving_date"],
		ignore_permissions=True,
		limit_page_length=1,
	)
	return emp[0] if emp else {}