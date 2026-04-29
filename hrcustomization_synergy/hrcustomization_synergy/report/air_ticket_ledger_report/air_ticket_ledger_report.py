import frappe
from frappe import _
from frappe.utils import flt

def execute(filters=None):
    if not filters:
        filters = {}

    validate_filters(filters)

    columns = get_columns()
    data = get_data(filters)

    return columns, data

def validate_filters(filters):
    if not filters.get("from_date") or not filters.get("to_date"):
        frappe.throw(_("Please select both <b>From Date</b> and <b>To Date</b>"))

    if filters.get("from_date") > filters.get("to_date"):
        frappe.throw(_("From Date cannot be greater than To Date"))

def get_columns():
    return [
        {"label": _("Employee ID"), "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 120},
        {"label": _("Employee Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 150},
        {"label": _("Department"), "fieldname": "department", "fieldtype": "Data", "width": 120},
        {"label": _("Date of Joining"), "fieldname": "date_of_joining", "fieldtype": "Date", "width": 120},
        {"label": _("Accrual Basis"), "fieldname": "accrual_basis", "fieldtype": "Currency", "width": 120},
        {"label": _("Opening Balance (Tickets)"), "fieldname": "opening_balance_tickets", "fieldtype": "Float", "width": 150},
        {"label": _("Opening Balance (Amount)"), "fieldname": "opening_balance_amount", "fieldtype": "Currency", "width": 150},
        {"label": _("Accrued (Tickets)"), "fieldname": "accrued_tickets", "fieldtype": "Float", "width": 120},
        {"label": _("Accrued (Amount)"), "fieldname": "accrued_amount", "fieldtype": "Currency", "width": 120},
        {"label": _("Utilized (Tickets)"), "fieldname": "utilized_tickets", "fieldtype": "Float", "width": 120},
        {"label": _("Utilized (Amount)"), "fieldname": "utilized_amount", "fieldtype": "Currency", "width": 120},
        {"label": _("Closing Balance (Tickets)"), "fieldname": "closing_balance_tickets", "fieldtype": "Float", "width": 150},
        {"label": _("Closing Balance (Amount)"), "fieldname": "closing_balance_amount", "fieldtype": "Currency", "width": 150},
    ]

def get_data(filters):
    conditions = {
        "from_date": filters.get("from_date"),
        "to_date": filters.get("to_date")
    }

    data = frappe.db.sql("""
        SELECT 
            emp.name AS employee,
            emp.employee_name,
            emp.department,
            emp.date_of_joining,
            emp.custom_amount AS accrual_basis,

            COALESCE((
                SELECT SUM(no_of_ticket) 
                FROM `tabAir Ticket Ledger Entry` 
                WHERE employee = emp.name 
                AND from_date < %(from_date)s
                AND utilized = 0
            ), 0) AS opening_balance_tickets,

            COALESCE((
                SELECT SUM(amount) 
                FROM `tabAir Ticket Ledger Entry` 
                WHERE employee = emp.name 
                AND from_date < %(from_date)s
                AND utilized = 0
            ), 0) AS opening_balance_amount,

            COALESCE((
                SELECT SUM(no_of_ticket) 
                FROM `tabAir Ticket Ledger Entry`
                WHERE employee = emp.name 
                AND from_date BETWEEN %(from_date)s AND %(to_date)s
                AND utilized = 0
            ), 0) AS accrued_tickets,

            COALESCE((
                SELECT SUM(amount) 
                FROM `tabAir Ticket Ledger Entry`
                WHERE employee = emp.name 
                AND from_date BETWEEN %(from_date)s AND %(to_date)s
                AND utilized = 0
            ), 0) AS accrued_amount,

            COALESCE((
                SELECT SUM(no_of_ticket) 
                FROM `tabAir Ticket Ledger Entry`
                WHERE employee = emp.name 
                AND utilized = 1 
                AND from_date BETWEEN %(from_date)s AND %(to_date)s
            ), 0) AS utilized_tickets,

            COALESCE((
                SELECT SUM(amount) 
                FROM `tabAir Ticket Ledger Entry`
                WHERE employee = emp.name 
                AND utilized = 1 
                AND from_date BETWEEN %(from_date)s AND %(to_date)s
            ), 0) AS utilized_amount

        FROM `tabEmployee` emp
        WHERE emp.status = 'Active'
        ORDER BY emp.department, emp.employee_name
    """, conditions, as_dict=True)

    for row in data:
        row["closing_balance_tickets"] = flt(row["opening_balance_tickets"]) + flt(row["accrued_tickets"]) + flt(row["utilized_tickets"])
        row["closing_balance_amount"] = flt(row["opening_balance_amount"]) + flt(row["accrued_amount"]) + flt(row["utilized_amount"])

    return data
