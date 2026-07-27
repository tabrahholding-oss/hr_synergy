import frappe


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {
            "label": "Employee Code",
            "fieldname": "employee_code",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 120,
        },
        {
            "label": "Employee Name",
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 200,
        },
        {
            "label": "Department",
            "fieldname": "department",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": "In Count",
            "fieldname": "in_count",
            "fieldtype": "Int",
            "width": 100,
        },
        {
            "label": "Out Count",
            "fieldname": "out_count",
            "fieldtype": "Int",
            "width": 100,
        },
        {
            "label": "Status",
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 120,
        },
    ]


def get_data(filters):
    conditions = []

    if filters.get("employee"):
        conditions.append("emp.name = %(employee)s")

    conditions = " AND " + " AND ".join(conditions) if conditions else ""

    return frappe.db.sql(
        f"""
        SELECT
            emp.name AS employee_code,
            emp.employee_name,
            emp.department,

            SUM(
                CASE
                    WHEN UPPER(ec.log_type) = 'IN' THEN 1
                    ELSE 0
                END
            ) AS in_count,

            SUM(
                CASE
                    WHEN UPPER(ec.log_type) = 'OUT' THEN 1
                    ELSE 0
                END
            ) AS out_count,

            CASE
                WHEN COUNT(ec.name) > 0 THEN 'Present'
                ELSE 'Absent'
            END AS status

        FROM `tabEmployee` emp

        LEFT JOIN `tabEmployee Checkin` ec
            ON ec.employee = emp.name
            AND DATE(ec.time) BETWEEN %(from_date)s AND %(to_date)s

        WHERE
            emp.status = 'Active'
            AND emp.department != 'Villa Guard - GTTC'
            {conditions}

        GROUP BY
            emp.name,
            emp.employee_name,
            emp.department

        ORDER BY
            emp.name
        """,
        filters,
        as_dict=True,
    )