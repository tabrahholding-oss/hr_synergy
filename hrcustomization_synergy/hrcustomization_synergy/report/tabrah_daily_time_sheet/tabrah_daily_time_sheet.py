# Copyright (c) 2025, Aadhil and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate, get_datetime, add_days, time_diff_in_hours
from collections import defaultdict, OrderedDict


def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 150},
        {"label": "Emp Code", "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 200},
        {"label": "Emp Name", "fieldname": "employee_name", "fieldtype": "Data", "width": 200},
        {"label": "Time In", "fieldname": "time_in", "fieldtype": "Time", "width": 120},
        {"label": "Time Out", "fieldname": "time_out", "fieldtype": "Time", "width": 120},
        {"label": "Total Hours", "fieldname": "total_hours", "fieldtype": "Data", "width": 120},
        {"label": "OT Hours", "fieldname": "ot_hours", "fieldtype": "Data", "width": 120},
    ]


def format_hours_as_time(hours):
    if hours is None:
        return None

    total_minutes = int(hours * 60)
    hh, mm = divmod(total_minutes, 60)
    return f"{hh:02d}:{mm:02d}"


def get_data(filters):
    from_date = getdate(filters.get("from_date"))
    to_date = getdate(filters.get("to_date"))
    employee = filters.get("employee")

    # Detect project field dynamically
    columns = frappe.db.get_table_columns("Employee Checkin")

    project_field = None
    if "custom_project" in columns:
        project_field = "custom_project"
    elif "project" in columns:
        project_field = "project"

    fields = [
        "employee",
        "employee_name",
        "time",
        "log_type",
    ]

    if project_field:
        fields.append(project_field)

    conditions = {
        "time": ["between", [from_date, to_date]]
    }

    if employee:
        conditions["employee"] = employee

    checkins = frappe.get_all(
        "Employee Checkin",
        fields=fields,
        filters=conditions,
        order_by="employee asc, time asc"
    )

    # Group checkins
    checkin_map = {}
    employees_in_data = set()

    for c in checkins:
        employees_in_data.add((c.employee, c.employee_name))
        date_str = str(getdate(c.time))
        checkin_map.setdefault((c.employee, date_str), []).append(c)

    if employee:
        emp_doc = frappe.get_doc("Employee", employee)
        employee_list = [(emp_doc.name, emp_doc.employee_name)]

    else:
        employee_list = sorted(list(employees_in_data))

    data = []

    for emp_code, emp_name in employee_list:

        current_date = from_date

        while current_date <= to_date:

            date_str = str(current_date)

            time_in = None
            time_out = None

            project_hours = defaultdict(float)

            if (emp_code, date_str) in checkin_map:

                records = sorted(
                    checkin_map[(emp_code, date_str)],
                    key=lambda x: x.time
                )

                in_time = None
                current_project = None

                for rec in records:

                    project_value = getattr(rec, project_field, None) if project_field else None

                    if rec.log_type == "IN":
                        in_time = get_datetime(rec.time)
                        current_project = project_value

                        if not time_in:
                            time_in = in_time.time()

                    elif rec.log_type == "OUT" and in_time:

                        out_time = get_datetime(rec.time)

                        time_out = out_time.time()

                        hours = time_diff_in_hours(out_time, in_time)

                        if current_project:
                            project_hours[current_project] += hours

                        in_time = None
                        current_project = None

            project_hours_ordered = OrderedDict(sorted(project_hours.items()))

            actual_total_hours = sum(project_hours_ordered.values())

            total_hours = actual_total_hours

            if total_hours > 0.5:
                total_hours -= 0.5

            formatted_total_hours = format_hours_as_time(total_hours)

            ot_hours = 0

            if actual_total_hours > 9:
                ot_hours = round(actual_total_hours - 8.5, 2)

            formatted_ot_hours = (
                format_hours_as_time(ot_hours)
                if ot_hours > 0
                else "00:00"
            )

            data.append({
                "date": current_date,
                "employee": emp_code,
                "employee_name": emp_name,
                "time_in": time_in,
                "time_out": time_out,
                "total_hours": formatted_total_hours,
                "ot_hours": formatted_ot_hours,
            })

            current_date = add_days(current_date, 1)

    return data