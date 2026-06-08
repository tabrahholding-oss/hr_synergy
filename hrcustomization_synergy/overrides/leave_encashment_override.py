import frappe
from frappe import _, bold
from frappe.utils import flt
from hrms.hr.doctype.leave_encashment.leave_encashment import LeaveEncashment
from hrms.hr.doctype.leave_application.leave_application import get_leaves_for_period


class LeaveEncashmentOverride(LeaveEncashment):

    # -----------------------------
    # Validate Encashment Days
    # -----------------------------
    def set_encashment_days(self):

        # Set default if not provided
        if not self.encashment_days:
            self.encashment_days = self.actual_encashable_days

        encashment_days = flt(self.encashment_days)
        actual_days = flt(self.actual_encashable_days)
        forecasted_days = flt(self.forecasted_encashable_days)

        # Case 1: Employee going on vacation or leaving company
        if self.employee_going_on_vacation or self.employee_leaving_company:
            if encashment_days > forecasted_days:
                frappe.throw(
                    _("Encashment Days cannot exceed {0} ({1})").format(
                        bold(_("Forecasted Encashable Days")),
                        forecasted_days,
                    )
                )

        # Case 2: Normal encashment
        else:
            if encashment_days > actual_days:
                frappe.throw(
                    _("Encashment Days cannot exceed {0} ({1})").format(
                        bold(_("Actual Encashable Days")),
                        actual_days,
                    )
                )

    # -----------------------------
    # Calculate Leave Balance
    # -----------------------------
    def set_leave_balance(self):
        allocation = self.get_leave_allocation()
        adjustment_balance = self.get_leave_adjustment_balance()
        if not allocation:
            frappe.throw(
				_("No Leaves Allocated to Employee: {0} for Leave Type: {1}").format(
					self.employee, self.leave_type
				)
			)

        base_leave_balance = (
			allocation.total_leaves_allocated
			- allocation.carry_forwarded_leaves_count
			# adding this because the function returns a -ve number
			+ get_leaves_for_period(
				self.employee, self.leave_type, allocation.from_date, self.encashment_date
			)
		)
        frappe.msgprint(get_leaves_for_period(
				self.employee, self.leave_type, allocation.from_date, self.encashment_date
			))
        
        frappe.msgprint(f"Adjustment: {adjustment_balance}")

        
        self.leave_balance = base_leave_balance + adjustment_balance
        self.leave_allocation = allocation.name

    # -----------------------------
    # Get Leave Adjustment Balance
    # -----------------------------
    def get_leave_adjustment_balance(self):

        adjustments = frappe.get_all(
            "Leave Adjustment",
            filters={
                "employee": self.employee,
                "leave_type": self.leave_type,
                "docstatus": 1,  # Only submitted adjustments
            },
            fields=[
                "adjustment_type",
                "SUM(leaves_to_adjust) as total_leaves",
            ],
            group_by="adjustment_type",
        )

        adjustment_balance = 0.0

        for row in adjustments:
            total = row.total_leaves or 0

            if row.adjustment_type == "Allocate":
                adjustment_balance += total
            elif row.adjustment_type == "Reduce":
                adjustment_balance -= total

        return adjustment_balance
