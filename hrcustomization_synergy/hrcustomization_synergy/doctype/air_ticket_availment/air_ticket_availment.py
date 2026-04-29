import frappe
from frappe.model.document import Document

class AirTicketAvailment(Document):
    def before_save(self):
        self.update_accrued_values()

    def update_accrued_values(self):
        if self.employee and self.posting_date:
            ticket_balance_data = frappe.db.sql("""
                SELECT 
                    COALESCE(SUM(no_of_ticket), 0) AS total_ticket_balance,
                    COALESCE(SUM(amount), 0) AS total_accrued_amount
                FROM `tabAir Ticket Ledger Entry`
                WHERE employee=%s AND from_date <= %s AND to_date <= %s
            """, (self.employee, self.posting_date, self.posting_date), as_dict=True)

            if ticket_balance_data:
                self.accrued_ticket_till_posting_date = ticket_balance_data[0].total_ticket_balance or 0
                self.accrued_amount = ticket_balance_data[0].total_accrued_amount or 0
            else:
                self.accrued_ticket_till_posting_date = 0
                self.accrued_amount = 0

    def on_submit(self):
        self.create_air_ticket_ledger_entry()
        self.create_additional_salary_entry()

    def on_cancel(self):
        self.cancel_air_ticket_ledger_entry()
        self.cancel_additional_salary_entry()

    def create_air_ticket_ledger_entry(self):
        if not self.employee or not self.accrued_ticket_till_posting_date:
            frappe.throw("Employee, accrued tickets, or accrued amount is missing.")
        
        ticket_ledger_entry = frappe.get_doc({
            "doctype": "Air Ticket Ledger Entry",
            "employee": self.employee,
            "transaction_type": "Air Ticket Availment",
            "transaction_name": self.name,
            "from_date": self.posting_date,
            "to_date": self.posting_date,
            "no_of_ticket": -self.number_of_ticket,
            "amount": -self.amount,
            "utilized": 1,
        })

        ticket_ledger_entry.insert(ignore_permissions=True)
        frappe.db.commit()
        ticket_ledger_entry.submit()

    def cancel_air_ticket_ledger_entry(self):
        ticket_ledger_entries = frappe.get_all(
            'Air Ticket Ledger Entry',
            filters={
                'transaction_name': self.name,
                'employee': self.employee,
            },
            fields=['name']
        )

        if ticket_ledger_entries:
            for entry in ticket_ledger_entries:
                frappe.delete_doc('Air Ticket Ledger Entry', entry.name, ignore_permissions=True)
            
            frappe.db.commit()

    def create_additional_salary_entry(self):
        if self.availment_method == "Payroll" and self.salary_component and self.amount > 0:
            additional_salary = frappe.get_doc({
                "doctype": "Additional Salary",
                "employee": self.employee,
                "salary_component": self.salary_component,
                "amount": self.amount,
                "payroll_date": self.posting_date,
                "ref_docname": self.name,
                "ref_doctype": "Air Ticket Availment"
            })

            additional_salary.insert(ignore_permissions=True)
            frappe.db.commit()
            additional_salary.submit()

    def cancel_additional_salary_entry(self):
        additional_salary_entries = frappe.get_all(
            'Additional Salary',
            filters={
                'ref_docname': self.name,
                'ref_doctype': "Air Ticket Availment",
                'employee': self.employee,
            },
            fields=['name']
        )

        if additional_salary_entries:
            for entry in additional_salary_entries:
                frappe.delete_doc('Additional Salary', entry.name, ignore_permissions=True)
            
            frappe.db.commit()
