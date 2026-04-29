# Copyright (c) 2025, NexTash and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import today, date_diff, getdate

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {"label": "Employee ID", "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 120},
        {"label": "Name", "fieldname": "employee_name", "fieldtype": "Data", "width": 150},
        {"label": "Date of Joining", "fieldname": "date_of_joining", "fieldtype": "Date", "width": 120},
        {"label": "Basic", "fieldname": "base", "fieldtype": "Currency", "width": 120},
        {"label": "Working Days", "fieldname": "working_days", "fieldtype": "Int", "width": 120},
        {"label": "Monthly Days", "fieldname": "monthly_days", "fieldtype": "Float", "width": 120},
        {"label": "Monthly Amount", "fieldname": "monthly_amount", "fieldtype": "Currency", "width": 120},
        {"label": "Accrued Days", "fieldname": "accrued_days", "fieldtype": "Int", "width": 120},
        {"label": "Accrued Amount", "fieldname": "accrued_amount", "fieldtype": "Currency", "width": 120},
    ]

def get_data(filters):
    conditions = []

    if filters.get("from_date") and filters.get("to_date"):
        conditions.append("emp.date_of_joining BETWEEN %(from_date)s AND %(to_date)s")

    if filters.get("company"):
        conditions.append("emp.company = %(company)s")

    if filters.get("department"):
        conditions.append("emp.department = %(department)s")

    if filters.get("employee"):
        conditions.append("emp.name = %(employee)s")

    if filters.get("employee_status"):
        conditions.append("emp.status = %(employee_status)s")

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    employees = frappe.db.sql(f"""
        SELECT emp.name, emp.employee_name, emp.date_of_joining, emp.company, emp.department,
               (SELECT base FROM `tabSalary Structure Assignment` WHERE employee = emp.name ORDER BY creation DESC LIMIT 1) AS base_salary
        FROM `tabEmployee` emp
        WHERE {where_clause}
    """, filters, as_dict=True)

    data = []
    to_date = getdate(filters.get("to_date")) if filters.get("to_date") else getdate(frappe.utils.today())

    for emp in employees:
        base_salary = emp.base_salary or 0
        joining_date = getdate(emp.date_of_joining) if emp.date_of_joining else today()
        working_days = date_diff(to_date, joining_date)
        monthly_days = (360 / 12) * (0.7) / 12
        monthly_amount = ((base_salary * 0.7) / 21) * monthly_days
        accrued_days = working_days
        accrued_amount = (accrued_days * 12 * 21 * base_salary)/(360*360)

        data.append({
            "employee": emp.name,
            "employee_name": emp.employee_name,
            "date_of_joining": emp.date_of_joining,
            "base": base_salary,
            "working_days": working_days,
            "monthly_days": monthly_days,
            "monthly_amount": monthly_amount,
            "accrued_days": accrued_days,
            "accrued_amount": accrued_amount
        })
    
    return data
