import frappe


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {
            "label": "Employee",
            "fieldname": "employee_id",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 140,
        },
        {
            "label": "Employee Name",
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 220,
        },
        {
            "label": "Department",
            "fieldname": "department",
            "fieldtype": "Data",
            "width": 180,
        },
        {
            "label": "Designation",
            "fieldname": "designation",
            "fieldtype": "Data",
            "width": 180,
        },
    ]


def get_data(filters):
    conditions = []

    if filters.get("employee"):
        conditions.append("e.name = %(employee)s")

    if filters.get("from_date") and filters.get("to_date"):
        checkin_condition = """
            DATE(ec.time) BETWEEN %(from_date)s AND %(to_date)s
        """
    elif filters.get("from_date"):
        checkin_condition = """
            DATE(ec.time) >= %(from_date)s
        """
    elif filters.get("to_date"):
        checkin_condition = """
            DATE(ec.time) <= %(to_date)s
        """
    else:
        checkin_condition = "1=0"

    if conditions:
        conditions = " AND " + " AND ".join(conditions)
    else:
        conditions = ""

    query = f"""
        SELECT
            e.name AS employee_id,
            e.employee_name,
            e.department,
            e.designation
        FROM `tabEmployee` e
        WHERE
            e.status = 'Active'
            AND e.department != 'Villa Guard - GTTC'
            {conditions}
            AND e.name NOT IN (
                SELECT ec.employee
                FROM `tabEmployee Checkin` ec
                WHERE {checkin_condition}
            )
        ORDER BY
            e.department,
            e.employee_name
    """

    return frappe.db.sql(query, filters, as_dict=True)