import frappe
from frappe import _
from frappe.utils import add_days, getdate

DAY_OFF_SHIFT_TYPE = "WEEK OFF"


def validate_day_off_restriction(doc, method=None):
	"""Block a new 'WEEK OFF' Shift Assignment if the employee already
	got a WEEK OFF within the previous 7 days — only for employees
	where the custom 'Shift' checkbox is enabled."""

	if doc.shift_type != DAY_OFF_SHIFT_TYPE:
		return

	if not doc.employee:
		return

	if not frappe.db.get_value("Employee", doc.employee, "custom_shift"):
		return

	start_date = getdate(doc.start_date)
	window_start = add_days(start_date, -7)

	existing = frappe.db.get_value(
		"Shift Assignment",
		{
			"employee": doc.employee,
			"shift_type": DAY_OFF_SHIFT_TYPE,
			"name": ["!=", doc.name],
			"docstatus": ["!=", 2],
			"start_date": ["between", [window_start, start_date]],
		},
		["name", "start_date"],
	)

	if existing:
		frappe.throw(
			_(
				"{0} was already given a Week Off on {1}. "
				"A Week Off cannot be assigned again within 7 days of the previous one."
			).format(doc.employee_name or doc.employee, existing[1])
		)