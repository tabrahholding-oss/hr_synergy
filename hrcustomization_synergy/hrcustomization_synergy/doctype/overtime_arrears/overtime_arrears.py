import frappe
from frappe.model.document import Document

class OvertimeArrears(Document):
    def before_submit(self):
        # Validation check
        if not self.overtime_records:
            frappe.throw("No overtime records found.")

        employee_ot_map = {}

        # Group OT by employee
        for row in self.overtime_records:
            if not row.employee or not row.total_ot_salary:
                continue

            current_total = employee_ot_map.get(row.employee) or 0
            employee_ot_map[row.employee] = current_total + float(row.total_ot_salary)

        # Create Additional Salary per employee
        for employee, total_amount in employee_ot_map.items():
            if not total_amount or total_amount <= 0:
                continue

            # Prevent duplicate Additional Salary on re-submit
            existing = frappe.get_all(
                "Additional Salary",
                filters={
                    "employee": employee,
                    "ref_doctype": "Overtime Arrears",
                    "ref_docname": self.name,
                    "docstatus": 1
                },
                limit=1
            )

            if existing:
                continue

            additional_salary = frappe.get_doc({
                "doctype": "Additional Salary",
                "employee": employee,
                "salary_component": "Arrear Overtime",
                "amount": total_amount,
                "payroll_date": self.payroll_date or self.to_date,
                "ref_doctype": "Overtime Arrears",
                "ref_docname": self.name
            })

            additional_salary.insert(ignore_permissions=True)
            additional_salary.submit()