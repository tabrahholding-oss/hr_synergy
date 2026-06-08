import frappe
import hrms.hr.doctype.leave_application.leave_application as leave_module
from frappe import _
from frappe.model.workflow import get_workflow_name
from frappe.query_builder.functions import Max, Min, Sum
from frappe.utils import (
	add_days,
	cint,
	cstr,
	date_diff,
	flt,
	formatdate,
	get_fullname,
	get_link_to_form,
	getdate,
	nowdate,
)

from erpnext.buying.doctype.supplier_scorecard.supplier_scorecard import daterange
from erpnext.setup.doctype.employee.employee import get_holiday_list_for_employee


# 🔥 Your custom function
def get_leave_allocation_records_override(employee, date, leave_type=None):
	"""Returns the total allocated leaves and carry forwarded leaves based on ledger entries"""

	#added_leave adjustment
	Ledger = frappe.qb.DocType("Leave Ledger Entry")
	LeaveAllocation = frappe.qb.DocType("Leave Allocation")
	LeaveAdjustment = frappe.qb.DocType("Leave Adjustment") #This line is added by Isfak Ahmed

	cf_leave_case = frappe.qb.terms.Case().when(Ledger.is_carry_forward == "1", Ledger.leaves).else_(0)
	sum_cf_leaves = Sum(cf_leave_case).as_("cf_leaves")

	new_leaves_case = frappe.qb.terms.Case().when(Ledger.is_carry_forward == "0", Ledger.leaves).else_(0)
	sum_new_leaves = Sum(new_leaves_case).as_("new_leaves")

	query = (
		frappe.qb.from_(Ledger)
		.left_join(LeaveAllocation)
		.on(Ledger.transaction_name == LeaveAllocation.name)
		.left_join(LeaveAdjustment)
		.on(Ledger.transaction_name == LeaveAdjustment.name)#This line is added by Isfak Ahmed
		.select(
			sum_cf_leaves,
			sum_new_leaves,
			Min(Ledger.from_date).as_("from_date"),
			Max(Ledger.to_date).as_("to_date"),
			Ledger.leave_type,
			Ledger.employee,
		)
		.where(
			(Ledger.from_date <= date)
			& (Ledger.docstatus == 1)
			& (
				(Ledger.transaction_type == "Leave Allocation")
				| (Ledger.transaction_type == "Leave Adjustment")#This line is added by Isfak Ahmed
			)
			& (Ledger.employee == employee)
			& (Ledger.is_expired == 0)
			& (Ledger.is_lwp == 0)
			& (
				# newly allocated leave's end date is same as the leave allocation's to date
				((Ledger.is_carry_forward == 0) & (Ledger.to_date >= date))
				# carry forwarded leave's end date won't be same as the leave allocation's to date
				# it's between the leave allocation's from and to date
				| (
					(Ledger.is_carry_forward == 1)
					& (
						Ledger.to_date.between(LeaveAllocation.from_date, LeaveAllocation.to_date)
						| (Ledger.to_date.between(LeaveAdjustment.from_date, LeaveAdjustment.to_date))#This line is added by Isfak Ahmed
					)
					# only consider cf leaves from current allocation
					& ((LeaveAllocation.from_date <= date) | (LeaveAdjustment.from_date <= date))#This line is added by Isfak Ahmed
					& ((date <= LeaveAllocation.to_date) | (date <= LeaveAdjustment.to_date))#This line is added by Isfak Ahmed
				)
			)
		)
	)

	if leave_type:
		query = query.where(Ledger.leave_type == leave_type)
	query = query.groupby(Ledger.employee, Ledger.leave_type)

	allocation_details = query.run(as_dict=True)
	allocated_leaves = frappe._dict()
	for d in allocation_details:
		allocated_leaves.setdefault(
			d.leave_type,
			frappe._dict(
				{
					"from_date": d.from_date,
					"to_date": d.to_date,
					"total_leaves_allocated": flt(d.cf_leaves) + flt(d.new_leaves),
					"unused_leaves": d.cf_leaves,
					"new_leaves_allocated": d.new_leaves,
					"leave_type": d.leave_type,
					"employee": d.employee,
				}
			),
		)
	return allocated_leaves


# 🔥 Apply patch
def apply_patch():
    leave_module.get_leave_allocation_records = get_leave_allocation_records_override
