# Copyright (c) 2025, NexTash and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

def execute(filters=None):
    # Ensure mandatory company filter is provided
    if not filters.get("company"):
        frappe.throw("Company is mandatory for this report.")
    
    # Get columns and data for the report
    columns = get_columns(filters)
    data, projects, cost_centers = get_pivot_data(filters)
    formatted_data = format_pivot_data(data, projects, cost_centers)
    
    return columns, formatted_data

def get_columns(filters):
    # Get final (non-group) cost centers for the selected company
    cost_centers = frappe.get_all(
        "Cost Center",
        filters={"is_group": 0, "company": filters.get("company")},
        pluck="name"
    )

    columns = [
        {"label": "Project", "fieldname": "custom_project", "fieldtype": "Link", "options": "Project", "width": 200},
    ]

    # Add a column for each cost center
    for cost_center in cost_centers:
        columns.append({
            "label": cost_center,
            "fieldname": frappe.scrub(cost_center),  # Converts to snake_case for fieldname
            "fieldtype": "Currency",
            "width": 120,
        })

    # Add a total column
    columns.append({
        "label": "Total",
        "fieldname": "total",
        "fieldtype": "Currency",
        "width": 150
    })

    return columns

def get_pivot_data(filters):
    conditions = ""

    # Add company filter to the query conditions
    conditions += f" AND atd.company = '{filters.get('company')}'"

    # Add payroll entry or custom date range to the query conditions
    if filters.get("payroll_entry"):
        payroll_entry = frappe.get_doc("Payroll Entry", filters.get("payroll_entry"))
        conditions += f" AND atd.attendance_date BETWEEN '{payroll_entry.start_date}' AND '{payroll_entry.end_date}'"
    elif filters.get("start_date") and filters.get("end_date"):
        conditions += f" AND atd.attendance_date BETWEEN '{filters.get('start_date')}' AND '{filters.get('end_date')}'"

    # Fetch attendance data grouped by employee, project, and cost center
    attendance_data = frappe.db.sql(f"""
        SELECT
            atd.employee,
            atd.custom_project AS project,
            atd.custom_cost_center AS cost_center,
            COUNT(atd.name) AS days_worked
        FROM
            `tabAttendance` atd
        WHERE
            1=1 {conditions}
        GROUP BY
            atd.employee, atd.custom_project, atd.custom_cost_center
    """, as_dict=True)

    # Fetch salary slips for employees within the selected company and date range
    salary_slips = frappe.db.sql(f"""
        SELECT
            ss.employee,
            ss.net_pay
        FROM
            `tabSalary Slip` ss
        WHERE
            ss.start_date >= '{filters.get("start_date") or payroll_entry.start_date}'
            AND ss.end_date <= '{filters.get("end_date") or payroll_entry.end_date}'
            AND ss.company = '{filters.get("company")}'
    """, as_dict=True)

    # Map salary slips by employee
    salary_slip_map = {ss.employee: ss for ss in salary_slips}

    # Group data for pivot table
    pivot_data = {}
    projects = set()
    cost_centers = set()

    for row in attendance_data:
        employee = row.get("employee")
        project = row.get("project")
        cost_center = row.get("cost_center")
        days_worked = row.get("days_worked")
        projects.add(project)
        cost_centers.add(cost_center)

        salary_slip = salary_slip_map.get(employee)
        if salary_slip:
            # Total attendance days for the employee
            total_days = frappe.db.count(
                "Attendance",
                filters={
                    "employee": employee,
                    "attendance_date": ["between", [filters.get("start_date") or payroll_entry.start_date, filters.get("end_date") or payroll_entry.end_date]],
                },
            )
            if total_days > 0:
                split_amount = flt(salary_slip.net_pay) * flt(days_worked) / flt(total_days)
            else:
                split_amount = 0
        else:
            split_amount = 0

        if project not in pivot_data:
            pivot_data[project] = {}

        if cost_center not in pivot_data[project]:
            pivot_data[project][cost_center] = 0

        pivot_data[project][cost_center] += split_amount

    return pivot_data, sorted(projects), sorted(cost_centers)

def format_pivot_data(pivot_data, projects, cost_centers):
    formatted_data = []

    for project in projects:
        row = {
            "custom_project": project,
            "total": 0
        }
        for cost_center in cost_centers:
            fieldname = frappe.scrub(cost_center)  # Convert to snake_case
            amount = pivot_data.get(project, {}).get(cost_center, 0)
            row[fieldname] = amount
            row["total"] += amount
        
        formatted_data.append(row)
    
    return formatted_data

