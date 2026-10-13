import frappe
from frappe import _, bold
from frappe.desk.doctype.bulk_update.bulk_update import submit_cancel_or_update_docs
from frappe.utils import flt
from hrms.hr.doctype.leave_encashment.leave_encashment import LeaveEncashment


class LeaveEncashmentOverride(LeaveEncashment):
    def set_encashment_days(self):
        if not self.encashment_days:
            self.encashment_days = self.actual_encashable_days

        encashment_days = flt(self.encashment_days)
        actual_days = flt(self.actual_encashable_days)
        forecasted_days = flt(self.custom_forecasted_encashable_days)

        if self.custom_is_employee_going_on_vacation or self.custom_employee_leaving_company:
            if encashment_days > forecasted_days:
                frappe.throw(
                    _("Encashment Days cannot exceed {0} ({1})").format(
                        bold(_("Forecasted Encashable Days")),
                        forecasted_days,
                    )
                )
        elif encashment_days > actual_days:
            frappe.throw(
                _("Encashment Days cannot exceed {0} ({1})").format(
                    bold(_("Actual Encashable Days")),
                    actual_days,
                )
            )

    def set_leave_balance(self):
        allocation = self.get_leave_allocation()
        if not allocation:
            frappe.throw(_("No Leaves Allocated..."))

        from hrms.hr.doctype.leave_application.leave_application import get_leave_details

        leave_details = get_leave_details(self.employee, self.encashment_date)
        leave_info = leave_details.get("leave_allocation", {}).get(self.leave_type, {})
        self.leave_balance = flt(leave_info.get("remaining_leaves", 0))
        self.leave_allocation = allocation.name

    def get_leave_adjustment_balance(self):
        adjustments = frappe.get_all(
            "Leave Adjustment",
            filters={
                "employee": self.employee,
                "leave_type": self.leave_type,
                "docstatus": 1,
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

    def before_submit(self):
        if self.custom_is_employee_going_on_vacation == 1:
            current_date = frappe.utils.getdate(self.custom_vacation_from)
            end_date = frappe.utils.getdate(self.custom_vacation_end)
            while current_date <= end_date:
                attendance = frappe.new_doc("Attendance")
                attendance.employee = self.employee
                attendance.attendance_date = current_date
                attendance.status = "On Leave"
                attendance.flags.ignore_mandatory = True
                attendance.insert()
                attendance.submit()
                current_date = frappe.utils.add_days(current_date, 1)

    def before_cancel(self):
        filters = [
            ["employee", "=", self.employee],
            ["status", "=", "On Leave"],
            [
                "attendance_date",
                "between",
                (
                    frappe.utils.getdate(self.custom_vacation_from),
                    frappe.utils.getdate(self.custom_vacation_end),
                ),
            ],
        ]
        attendance_names = frappe.db.get_list(
            "Attendance",
            filters=filters,
            fields=["name"],
            pluck="name",
        )
        submit_cancel_or_update_docs(
            "Attendance",
            attendance_names,
            action="cancel",
            data=None,
            task_id=None,
        )
        super().before_cancel()

    def set_encashment_amount(self):
        salary_assignments = frappe.get_all(
            "Salary Structure Assignment",
            filters={"employee": self.employee, "from_date": ("<=", self.encashment_date)},
            order_by="from_date desc",
            limit_page_length=1,
        )
        if not salary_assignments:
            frappe.throw(
                _("No Salary Structure Assignment found for Employee {0}").format(self.employee)
            )

        salary_assignment = frappe.get_doc(
            "Salary Structure Assignment", salary_assignments[0].name
        )
        custom_formula = frappe.db.get_value(
            "Salary Structure",
            salary_assignment.salary_structure,
            "custom_leave_salary_formula",
        )

        if custom_formula:
            context = salary_assignment.as_dict()
            try:
                per_day_encashment = flt(frappe.safe_eval(custom_formula, None, context))
            except Exception as error:
                frappe.throw(
                    _("Error in evaluating leave salary formula: {0}").format(error)
                )
        else:
            per_day_encashment = frappe.db.get_value(
                "Salary Structure",
                salary_assignment.salary_structure,
                "leave_encashment_amount_per_day",
            )
            if not per_day_encashment:
                per_day_encashment = 0

        self.encashment_amount = self.encashment_days * per_day_encashment
