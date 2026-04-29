import frappe
from frappe import _
from frappe.utils import flt
from hrms.hr.doctype.leave_encashment.leave_encashment import LeaveEncashment
from frappe.desk.doctype.bulk_update.bulk_update import submit_cancel_or_update_docs

class CustomLeaveEncashment(LeaveEncashment):
    def before_save(self):
        self.custom_vacation_days = frappe.utils.date_diff(self.custom_vacation_end,self.custom_vacation_from) + 1
        self.encashment_days = self.custom_vacation_days
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
                current_date = frappe.utils.add_days(current_date,1)
    def before_cancel(self):
        filters = [
            ['employee', '=', self.employee],
            ['status', '=', 'On Leave'],
            ['attendance_date', 'between', (frappe.utils.getdate(self.custom_vacation_from), frappe.utils.getdate(self.custom_vacation_end))]
        ]
        all_attendance = frappe.db.get_list('Attendance', filters = filters, fields = ["name"], pluck = "name")
        submit_cancel_or_update_docs('Attendance', all_attendance, action="cancel", data=None, task_id=None)
        super().before_cancel()

    def set_encashment_amount(self):
        salary_assignment_list = frappe.get_all(
            "Salary Structure Assignment",
            filters={"employee": self.employee, "from_date": ("<=", self.encashment_date)},
            order_by="from_date desc",
            limit_page_length=1
        )
        if not salary_assignment_list:
            frappe.throw(_("No Salary Structure Assignment found for Employee {0}").format(self.employee))
        salary_assignment = frappe.get_doc("Salary Structure Assignment", salary_assignment_list[0].name)
        custom_formula = frappe.db.get_value(
            "Salary Structure", salary_assignment.salary_structure, "custom_leave_salary_formula"
        )
        
        if custom_formula:
            context = salary_assignment.as_dict()
            try:
                per_day_encashment = flt(frappe.safe_eval(custom_formula, None, context))
            except Exception as e:
                frappe.throw(_("Error in evaluating leave salary formula: {0}").format(e))
        else:
            per_day_encashment = frappe.db.get_value(
                "Salary Structure", salary_assignment.salary_structure, "leave_encashment_amount_per_day"
            )
            if not per_day_encashment:
                per_day_encashment = 0
        self.encashment_amount = self.encashment_days * per_day_encashment
