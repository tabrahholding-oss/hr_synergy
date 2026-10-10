# -*- coding: utf-8 -*-
"""
HR Dashboard  ->  Backend API
"""
import frappe
from frappe import _
from frappe.utils import (
    getdate, date_diff, flt, cint, nowdate, add_days, add_months,
    format_date, get_first_day, get_last_day,
)

# ===============================================================
# ACCESS CONTROL
# ===============================================================
ALLOWED_ROLES = {"Employee Explorer User", "System Manager"}


def _check_access():
    user_roles = set(frappe.get_roles(frappe.session.user))
    if not (user_roles & ALLOWED_ROLES):
        frappe.throw(
            _("You are not permitted to access HR Dashboard."),
            frappe.PermissionError,
        )

# ===============================================================
# ORGANISATION CHART
# ===============================================================
# ===============================================================
# ORGANISATION CHART
# ===============================================================
@frappe.whitelist()
def get_organization_chart(company=None):
    _check_access()

    filters = {"status": "Active"}
    if company:
        filters["company"] = company

    employees = frappe.get_all(
        "Employee",
        filters=filters,
        fields=[
            "name", "employee_name", "employee_number",
            "designation", "department", "image",
            "reports_to", "company",
        ],
        order_by="employee_name asc",
        limit_page_length=0,
    )

    if not employees:
        return {"roots": [], "total": 0}

    emp_map = {e.name: e for e in employees}   # ✅ _dict attribute access

    children_map = {}
    for e in employees:
        rt = e.reports_to
        if rt:
            children_map.setdefault(rt, []).append(e.name)

    roots = [e for e in employees if not e.reports_to or e.reports_to not in emp_map]

    def build_node(emp_name, visited=None):
        if visited is None:
            visited = set()
        if emp_name in visited:
            return None
        visited.add(emp_name)

        emp = emp_map.get(emp_name)
        if not emp:
            return None

        node = {
            "name":            emp.name,
            "employee_name":   emp.employee_name,
            "employee_number": emp.employee_number,
            "designation":     emp.designation,
            "department":      emp.department,
            "image":           emp.image,
            "company":         emp.company,
            "children":        [],
        }
        for child_name in children_map.get(emp_name, []):
            child = build_node(child_name, visited)
            if child:
                node["children"].append(child)
        return node

    tree = []
    for r in roots:
        node = build_node(r.name)
        if node:
            tree.append(node)

    return {"roots": tree, "total": len(employees)}
# ---------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------
UNPAID_LEAVE_TYPES = [
    "Annual Leave (Un Paid)",
    "Leave Without Pay",
    "Extended leave (Unpaid)",
]

SALARY_COMPONENTS = [
    ("Basic",                 "base"),
    ("Housing",               "custom_hra"),
    ("Transportation",        "custom_living_allowance"),
    ("Special Allowance",     "custom_special_allowance"),
    ("Other Allowance",       "custom_other_allowance"),
    ("Performance Allowance", "custom_performance_allowance"),
]


# ===============================================================
# HR DASHBOARD
# ===============================================================
@frappe.whitelist()
def get_hr_dashboard(month=None, company=None):
    _check_access()

    today = getdate(nowdate())

    # -------- Period --------
    if month:
        try:
            y, m = str(month).split("-")
            period_start = getdate(f"{y}-{m}-01")
        except Exception:
            period_start = get_first_day(today)
    else:
        period_start = get_first_day(today)
    period_end = get_last_day(period_start)

    vals = {"ps": period_start, "pe": period_end}
    company_cond = ""
    if company:
        company_cond = " AND company = %(company)s "
        vals["company"] = company

    # -------- Total Active (current) --------
    total_active = frappe.db.sql(f"""
        SELECT COUNT(*) FROM `tabEmployee`
        WHERE status = 'Active' {company_cond}
    """, vals)[0][0]

    # -------- New Hires in period --------
    new_hires = frappe.db.sql(f"""
        SELECT COUNT(*) FROM `tabEmployee`
        WHERE date_of_joining BETWEEN %(ps)s AND %(pe)s {company_cond}
    """, vals)[0][0]

    # -------- Employees Left in period --------
    left_count = frappe.db.sql(f"""
        SELECT COUNT(*) FROM `tabEmployee`
        WHERE status = 'Left'
          AND relieving_date BETWEEN %(ps)s AND %(pe)s {company_cond}
    """, vals)[0][0]

    # -------- Turnover Rate --------
    turnover_rate = (left_count / total_active * 100.0) if total_active else 0.0

    # -------- Attrition Rate --------
    emp_start = frappe.db.sql(f"""
        SELECT COUNT(*) FROM `tabEmployee`
        WHERE date_of_joining <= %(ps)s
          AND (relieving_date IS NULL OR relieving_date >= %(ps)s)
          {company_cond}
    """, vals)[0][0]

    emp_end = frappe.db.sql(f"""
        SELECT COUNT(*) FROM `tabEmployee`
        WHERE date_of_joining <= %(pe)s
          AND (relieving_date IS NULL OR relieving_date >= %(pe)s)
          {company_cond}
    """, vals)[0][0]

    avg_emp = (emp_start + emp_end) / 2.0 if (emp_start + emp_end) else 0
    attrition_rate = (left_count / avg_emp * 100.0) if avg_emp else 0.0

    # -------- Time to Hire --------
    time_to_hire = 0
    try:
        if frappe.db.exists("DocType", "Job Applicant"):
            r = frappe.db.sql("""
                SELECT AVG(DATEDIFF(offer_date, creation))
                FROM `tabJob Applicant`
                WHERE status = 'Accepted' AND offer_date IS NOT NULL
            """)
            if r and r[0][0]:
                time_to_hire = flt(r[0][0], 0)
    except Exception:
        pass

    # -------- Offer Acceptance Rate --------
    offer_accept_rate = 0.0
    try:
        if frappe.db.exists("DocType", "Job Offer"):
            total_offers = frappe.db.sql("""
                SELECT COUNT(*) FROM `tabJob Offer`
                WHERE status IN ('Accepted', 'Rejected', 'Awaiting Response')
            """)[0][0]
            accepted = frappe.db.sql("""
                SELECT COUNT(*) FROM `tabJob Offer` WHERE status = 'Accepted'
            """)[0][0]
            if total_offers:
                offer_accept_rate = accepted / float(total_offers) * 100.0
    except Exception:
        pass

    # -------- Headcount Trend (last 12 months) --------
    headcount_trend = []
    for i in range(11, -1, -1):
        m_date = add_months(period_end, -i)
        m_end = get_last_day(m_date)
        cnt = frappe.db.sql(f"""
            SELECT COUNT(*) FROM `tabEmployee`
            WHERE date_of_joining <= %(me)s
              AND (relieving_date IS NULL OR relieving_date > %(me)s)
              {company_cond}
        """, {**vals, "me": m_end})[0][0]
        headcount_trend.append({
            "label": m_end.strftime("%b %y"),
            "value": cnt,
        })

    # -------- Department Distribution --------
    by_department = frappe.db.sql(f"""
        SELECT IFNULL(department, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee`
        WHERE status = 'Active' {company_cond}
        GROUP BY department
        ORDER BY value DESC
    """, vals, as_dict=True)

    # -------- Employment Type --------
    by_employment_type = frappe.db.sql(f"""
        SELECT IFNULL(employment_type, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee`
        WHERE status = 'Active' {company_cond}
        GROUP BY employment_type
    """, vals, as_dict=True)

    # -------- Tenure --------
    tenure = [
        {"label": "< 1 year",     "value": 0},
        {"label": "1 - 3 years",  "value": 0},
        {"label": "3 - 5 years",  "value": 0},
        {"label": "5 - 10 years", "value": 0},
        {"label": "10+ years",    "value": 0},
    ]
    emp_rows = frappe.db.sql(f"""
        SELECT date_of_joining FROM `tabEmployee`
        WHERE status = 'Active' AND date_of_joining IS NOT NULL {company_cond}
    """, vals, as_dict=True)
    for r in emp_rows:
        try:
            doj = getdate(r.date_of_joining)
            yrs = (today - doj).days / 365.25
        except Exception:
            continue
        if yrs < 1:        tenure[0]["value"] += 1
        elif yrs < 3:      tenure[1]["value"] += 1
        elif yrs < 5:      tenure[2]["value"] += 1
        elif yrs < 10:     tenure[3]["value"] += 1
        else:              tenure[4]["value"] += 1

    # -------- Recruitment Funnel --------
    recruitment_funnel = []
    try:
        if frappe.db.exists("DocType", "Job Applicant"):
            rows = frappe.db.sql("""
                SELECT status, COUNT(*) as cnt FROM `tabJob Applicant`
                GROUP BY status
            """, as_dict=True)
            counts = {r.status: r.cnt for r in rows}
            for s in ["Open", "Screening", "Shortlisted",
                      "Interview", "Offer", "Accepted"]:
                if s in counts:
                    recruitment_funnel.append({"label": s, "value": counts[s]})
    except Exception:
        pass

    # -------- Hires by Source --------
    hires_by_source = []
    try:
        if frappe.db.exists("DocType", "Job Applicant"):
            hires_by_source = frappe.db.sql("""
                SELECT IFNULL(source, 'Other') AS label, COUNT(*) AS value
                FROM `tabJob Applicant`
                WHERE status = 'Accepted'
                GROUP BY source
                ORDER BY value DESC
                LIMIT 8
            """, as_dict=True)
    except Exception:
        pass

    # -------- Open Positions --------
    open_positions = {"total": 0, "rows": []}
    try:
        if frappe.db.exists("DocType", "Job Opening"):
            open_positions["total"] = frappe.db.count("Job Opening", {"status": "Open"})
            open_positions["rows"] = frappe.db.sql("""
                SELECT designation AS label, COUNT(*) AS value
                FROM `tabJob Opening`
                WHERE status = 'Open'
                GROUP BY designation
                ORDER BY value DESC
                LIMIT 6
            """, as_dict=True)
    except Exception:
        pass

    # -------- Company Options --------
    companies = [r[0] for r in frappe.db.sql("""
        SELECT DISTINCT company FROM `tabEmployee`
        WHERE IFNULL(company, '') != ''
        ORDER BY company
    """)]

    return {
        "kpis": {
            "total_employees":       total_active,
            "new_hires":             new_hires,
            "turnover_rate":         flt(turnover_rate, 2),
            "attrition_rate":        flt(attrition_rate, 2),
            "time_to_hire":          flt(time_to_hire, 0),
            "offer_acceptance_rate": flt(offer_accept_rate, 2),
            "left_count":            left_count,
        },
        "headcount_trend":     headcount_trend,
        "by_department":       by_department,
        "by_employment_type":  by_employment_type,
        "tenure":              tenure,
        "recruitment_funnel":  recruitment_funnel,
        "hires_by_source":     hires_by_source,
        "open_positions":      open_positions,
        "companies":           companies,
    }


# ===============================================================
# EMPLOYEE SALARY SLIPS
# ===============================================================
@frappe.whitelist()
def get_employee_salary_slips(employee, limit=100):
    _check_access()
    if not employee:
        frappe.throw(_("Employee is required"))

    slips = frappe.db.sql("""
        SELECT
            ss.name, ss.employee, ss.employee_name,
            e.employee_number, e.gender, e.nationality, e.marital_status,
            ss.company, ss.department, ss.designation,
            ss.posting_date, ss.start_date, ss.end_date, ss.payment_days,
            ss.bank_name, ss.bank_account_no,
            ss.gross_pay, ss.total_deduction, ss.net_pay, ss.year_to_date,
            ss.currency, ss.status
        FROM `tabSalary Slip` ss
        LEFT JOIN `tabEmployee` e ON e.name = ss.employee
        WHERE ss.docstatus = 1 AND ss.employee = %(employee)s
        ORDER BY ss.start_date DESC, ss.posting_date DESC
        LIMIT %(limit)s
    """, {"employee": employee, "limit": cint(limit) or 100}, as_dict=True)

    if not slips:
        return []

    names = [s.name for s in slips]
    details = frappe.db.sql("""
        SELECT parent, salary_component, amount, parentfield
        FROM `tabSalary Detail`
        WHERE parent IN %(names)s AND parenttype = 'Salary Slip'
    """, {"names": names}, as_dict=True)

    by_parent = {}
    for d in details:
        by_parent.setdefault(d.parent, []).append(d)

    for s in slips:
        s["components"] = by_parent.get(s.name, [])

    return slips


# ===============================================================
# EMPLOYEE LETTERS
# ===============================================================
LETTER_DOCTYPES = {
    "Employee Letters": "certificate_type",
    "HR Letters":       "certificate_type",
}


@frappe.whitelist()
def get_employee_letters(employee, doctype_filter=None,
                         type_filter=None, status_filter=None):
    _check_access()
    if not employee:
        frappe.throw(_("Employee is required"))

    rows, all_rows = [], []

    for dt, tfield in LETTER_DOCTYPES.items():
        if doctype_filter and dt != doctype_filter:
            continue
        if not frappe.db.exists("DocType", dt):
            continue
        if not frappe.has_permission(dt, "read"):
            continue

        try:
            recs = frappe.get_all(
                dt,
                filters={"employee": employee},
                fields=["name", "status", "workflow_state",
                        "creation", "modified", tfield],
                order_by="creation desc",
                limit=500,
            )
        except Exception as ex:
            frappe.log_error(
                title=f"HR Dashboard letters fetch failed ({dt})",
                message=str(ex),
            )
            continue

        for r in recs:
            item = {
                "name":     r.get("name"),
                "doctype":  dt,
                "type":     r.get(tfield),
                "status":   r.get("workflow_state") or r.get("status") or "Draft",
                "creation": r.get("creation"),
                "modified": r.get("modified"),
            }
            all_rows.append(item)
            if type_filter   and item["type"]   != type_filter:   continue
            if status_filter and item["status"] != status_filter: continue
            rows.append(item)

    rows.sort(key=lambda x: x.get("creation") or "", reverse=True)

    status_counts, type_counts = {}, {}
    for r in rows:
        s = r["status"] or "Draft"
        t = r["type"] or "Unknown"
        status_counts[s] = status_counts.get(s, 0) + 1
        type_counts[t]   = type_counts.get(t, 0) + 1

    approved = status_counts.get("Approved", 0)
    draft    = status_counts.get("Draft", 0)
    rejected = status_counts.get("Rejected", 0)
    pending  = len(rows) - approved - draft - rejected

    all_types    = sorted(set(r["type"] for r in all_rows if r["type"]))
    all_statuses = sorted(set(r["status"] for r in all_rows if r["status"]))

    return {
        "rows":        rows,
        "has_letters": bool(all_rows),
        "count":       len(rows),
        "total_count": len(all_rows),
        "kpis": {
            "total":    len(rows),
            "approved": approved,
            "draft":    draft,
            "pending":  pending,
            "rejected": rejected,
        },
        "charts": {
            "by_status": {
                "labels": list(status_counts.keys()),
                "data":   list(status_counts.values()),
            },
            "by_type": {
                "labels": list(type_counts.keys()),
                "data":   list(type_counts.values()),
            },
        },
        "options": {
            "types":    all_types,
            "statuses": all_statuses,
            "doctypes": list(LETTER_DOCTYPES.keys()),
        },
    }


# ===============================================================
# HELPERS
# ===============================================================
def _service_period(date_of_joining, as_on=None):
    as_on = getdate(as_on or nowdate())
    doj = getdate(date_of_joining) if date_of_joining else None

    if not doj or as_on < doj:
        return {"days": 0, "years": 0, "months": 0, "rem_days": 0,
                "text": "0 Years, 0 Months, 0 Days"}

    total_days = date_diff(as_on, doj)
    years  = as_on.year - doj.year
    months = as_on.month - doj.month
    days   = as_on.day - doj.day

    if days < 0:
        months -= 1
        days += add_days(as_on.replace(day=1), -1).day
    if months < 0:
        years -= 1
        months += 12

    return {
        "days": total_days,
        "years": years, "months": months, "rem_days": days,
        "text": f"{years} Years, {months} Months, {days} Days",
    }


def _gratuity(basic_salary, date_of_joining, as_on=None):
    as_on = getdate(as_on or nowdate())
    doj = getdate(date_of_joining) if date_of_joining else None
    basic = flt(basic_salary)
    if not doj or basic <= 0:
        return 0.0
    days = date_diff(as_on, doj)
    if days <= 0:
        return 0.0
    if days < 1826:
        return flt(basic * 0.7 * days / 365.0, 2)
    return flt(basic * days / 365.0, 2)


def _latest_ssa(employee):
    rows = frappe.db.sql("""
        SELECT ssa.salary_structure, ssa.from_date, ssa.base,
               ssa.custom_hra, ssa.custom_living_allowance,
               ssa.custom_special_allowance, ssa.custom_other_allowance,
               ssa.custom_performance_allowance, ssa.custom_total_salary
        FROM `tabSalary Structure Assignment` ssa
        WHERE ssa.employee = %(employee)s AND ssa.docstatus = 1
        ORDER BY ssa.from_date DESC, ssa.creation DESC
        LIMIT 1
    """, {"employee": employee}, as_dict=True)
    return rows[0] if rows else {}


# ===============================================================
# DASHBOARD (list view cards)
# ===============================================================
@frappe.whitelist()
def get_dashboard(search=None, department=None, status=None,
                  company=None, employment_type=None):
    _check_access()

    cond = ["1 = 1"]
    vals = {}
    if search:
        cond.append("""(
            e.name LIKE %(search)s
            OR IFNULL(e.employee_name,'')     LIKE %(search)s
            OR IFNULL(e.employee_number,'')   LIKE %(search)s
            OR IFNULL(e.custom_qid_number,'') LIKE %(search)s
            OR IFNULL(e.cell_number,'')       LIKE %(search)s
            OR IFNULL(e.personal_email,'')    LIKE %(search)s
        )""")
        vals["search"] = f"%{search}%"

    if department:
        cond.append("e.department = %(department)s"); vals["department"] = department
    if status:
        cond.append("e.status = %(status)s"); vals["status"] = status
    if company:
        cond.append("e.company = %(company)s"); vals["company"] = company
    if employment_type:
        cond.append("e.employment_type = %(employment_type)s"); vals["employment_type"] = employment_type

    where = " AND ".join(cond)

    total  = frappe.db.sql(f"SELECT COUNT(*) FROM `tabEmployee` e WHERE {where}", vals)[0][0]
    active = frappe.db.sql(f"SELECT COUNT(*) FROM `tabEmployee` e WHERE {where} AND e.status='Active'", vals)[0][0]
    left   = frappe.db.sql(f"SELECT COUNT(*) FROM `tabEmployee` e WHERE {where} AND e.status='Left'", vals)[0][0]

    by_department = frappe.db.sql(f"""
        SELECT IFNULL(e.department, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee` e
        WHERE {where} AND IFNULL(e.status,'') != 'Left'
        GROUP BY e.department ORDER BY value DESC LIMIT 8
    """, vals, as_dict=True)

    by_gender = frappe.db.sql(f"""
        SELECT IFNULL(e.gender, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee` e
        WHERE {where} AND IFNULL(e.status,'') != 'Left'
        GROUP BY e.gender
    """, vals, as_dict=True)

    return {
        "cards": {
            "total": total, "active": active, "left": left,
            "departments": len(by_department),
        },
        "by_department": by_department,
        "by_gender": by_gender,
    }


# ===============================================================
# EMPLOYEE LIST
# ===============================================================
@frappe.whitelist()
def get_employees(search=None, department=None, status=None,
                  company=None, employment_type=None, limit=500):
    _check_access()

    cond = ["1 = 1"]
    vals = {"limit": cint(limit) or 500}
    if search:
        cond.append("""(
            e.name LIKE %(search)s
            OR IFNULL(e.employee_name,'')     LIKE %(search)s
            OR IFNULL(e.employee_number,'')   LIKE %(search)s
            OR IFNULL(e.custom_qid_number,'') LIKE %(search)s
            OR IFNULL(e.cell_number,'')       LIKE %(search)s
            OR IFNULL(e.personal_email,'')    LIKE %(search)s
        )""")
        vals["search"] = f"%{search}%"
    if department:
        cond.append("e.department = %(department)s"); vals["department"] = department
    if status:
        cond.append("e.status = %(status)s"); vals["status"] = status
    if company:
        cond.append("e.company = %(company)s"); vals["company"] = company
    if employment_type:
        cond.append("e.employment_type = %(employment_type)s"); vals["employment_type"] = employment_type

    where = " AND ".join(cond)
    return frappe.db.sql(f"""
        SELECT
            e.name, e.employee_name, e.employee_number,
            e.designation, e.department, e.company, e.branch,
            e.employment_type, e.status, e.date_of_joining,
            e.cell_number, e.personal_email, e.company_email, e.image,
            e.custom_qid_number, e.custom_valid_to, e.gender
        FROM `tabEmployee` e
        WHERE {where}
        ORDER BY e.employee_name
        LIMIT %(limit)s
    """, vals, as_dict=True)


# ===============================================================
# FILTER OPTIONS
# ===============================================================
@frappe.whitelist()
def get_employee_filter_options():
    _check_access()

    companies = frappe.db.sql("SELECT DISTINCT company AS value FROM `tabEmployee` WHERE IFNULL(company,'')!='' ORDER BY company", as_dict=True)
    statuses  = frappe.db.sql("SELECT DISTINCT status  AS value FROM `tabEmployee` WHERE IFNULL(status,'')!=''  ORDER BY status",  as_dict=True)
    etypes    = frappe.db.sql("SELECT DISTINCT employment_type AS value FROM `tabEmployee` WHERE IFNULL(employment_type,'')!='' ORDER BY employment_type", as_dict=True)
    depts     = frappe.db.sql("SELECT DISTINCT department AS value FROM `tabEmployee` WHERE IFNULL(department,'')!='' ORDER BY department", as_dict=True)

    return {
        "companies":        [r.value for r in companies],
        "statuses":         [r.value for r in statuses],
        "employment_types": [r.value for r in etypes],
        "departments":      [r.value for r in depts],
    }


# ===============================================================
# FULL EMPLOYEE PROFILE
# ===============================================================
@frappe.whitelist()
def get_employee_profile(employee):
    _check_access()
    if not employee:
        frappe.throw(_("Employee is required"))

    emp = frappe.db.get_value("Employee", employee, "*", as_dict=True)
    if not emp:
        frappe.throw(_("Employee {0} not found").format(employee))

    ssa   = _latest_ssa(employee)
    basic = flt(ssa.get("base"))
    doj   = emp.get("date_of_joining")

    return {
        "employee": emp,
        "service":  _service_period(doj),
        "gratuity": {
            "amount": _gratuity(basic, doj),
            "basic_salary": basic,
            "as_on": format_date(nowdate()),
        },
        "identification": {
            "qid_number":      emp.get("custom_qid_number"),
            "qid_expiry":      emp.get("custom_valid_to") or emp.get("custom_qid_expiry"),
            "passport_number": emp.get("passport_number"),
            "passport_expiry": emp.get("valid_upto"),
        },
        "leave":     _get_leave_data(employee),
        "documents": _get_documents(employee, emp),
        "salary":    _get_salary_data(ssa),
        "tickets":   _get_ticket_data(employee),
    }


# ------------------------- leave -------------------------
def _get_leave_data(employee):
    ledger = frappe.db.sql("""
        SELECT
            lle.leave_type,
            SUM(CASE WHEN lle.leaves > 0 AND IFNULL(lle.is_expired,0)=0
                     THEN lle.leaves ELSE 0 END)                       AS allocated,
            SUM(CASE WHEN lle.leaves > 0 AND IFNULL(lle.is_expired,0)=1
                     THEN lle.leaves ELSE 0 END)                       AS expired,
            SUM(CASE WHEN lle.leaves < 0
                      AND lle.transaction_type='Leave Application'
                     THEN ABS(lle.leaves) ELSE 0 END)                  AS used,
            SUM(CASE WHEN lle.leaves > 0 AND IFNULL(lle.is_carry_forward,0)=1
                     THEN lle.leaves ELSE 0 END)                       AS carry_forward
        FROM `tabLeave Ledger Entry` lle
        WHERE lle.docstatus = 1
          AND lle.employee  = %(employee)s
          AND lle.from_date >= MAKEDATE(YEAR(CURDATE()), 1)
          AND lle.from_date <  MAKEDATE(YEAR(CURDATE()) + 1, 1)
        GROUP BY lle.leave_type
    """, {"employee": employee}, as_dict=True)

    allocation = frappe.db.sql("""
        SELECT la.leave_type, SUM(la.total_leaves_allocated) AS total
        FROM `tabLeave Allocation` la
        WHERE la.docstatus = 1
          AND la.employee  = %(employee)s
          AND la.to_date   >= MAKEDATE(YEAR(CURDATE()), 1)
          AND la.from_date <  MAKEDATE(YEAR(CURDATE()) + 1, 1)
        GROUP BY la.leave_type
    """, {"employee": employee}, as_dict=True)

    pending = frappe.db.sql("""
        SELECT leave_type, SUM(total_leave_days) AS pending
        FROM `tabLeave Application`
        WHERE docstatus = 0 AND status = 'Open'
          AND employee = %(employee)s
          AND from_date <  MAKEDATE(YEAR(CURDATE()) + 1, 1)
          AND to_date   >= MAKEDATE(YEAR(CURDATE()), 1)
        GROUP BY leave_type
    """, {"employee": employee}, as_dict=True)

    unpaid = frappe.db.sql("""
        SELECT IFNULL(SUM(total_leave_days), 0)
        FROM `tabLeave Application`
        WHERE docstatus = 1 AND status = 'Approved'
          AND employee = %(employee)s
          AND leave_type IN %(types)s
          AND from_date <  MAKEDATE(YEAR(CURDATE()) + 1, 1)
          AND to_date   >= MAKEDATE(YEAR(CURDATE()), 1)
    """, {"employee": employee, "types": UNPAID_LEAVE_TYPES})[0][0]

    led   = {r.leave_type: r for r in ledger}
    alloc = {r.leave_type: flt(r.total) for r in allocation}
    pend  = {r.leave_type: flt(r.pending) for r in pending}

    types = []
    for t in list(led.keys()) + list(alloc.keys()) + list(pend.keys()):
        if t and t not in types:
            types.append(t)
    types.sort()

    other_balances, total_balance = [], 0.0
    for t in types:
        l        = led.get(t, {})
        eligible = alloc.get(t) or flt(l.get("allocated"))
        utilized = flt(l.get("used"))
        expired  = flt(l.get("expired"))
        p        = pend.get(t, 0.0)
        balance  = eligible - utilized - expired - p
        other_balances.append({
            "leave_type": t,
            "eligible":   flt(eligible, 2),
            "utilized":   flt(utilized, 2),
            "balance":    flt(balance, 2),
        })
        total_balance += balance

    carry_over = sum(flt(r.get("carry_forward")) for r in ledger)
    entitled   = sum(flt(r.get("allocated"))     for r in ledger)
    expired    = sum(flt(r.get("expired"))       for r in ledger)
    utilised   = sum(flt(r.get("used"))          for r in ledger)
    applied    = sum(flt(r.get("pending"))       for r in pending)

    breakdown = [
        {"label": "Carry over",              "value": flt(carry_over, 2)},
        {"label": "Entitled Leave",          "value": flt(entitled, 2)},
        {"label": "Utilised Leave",          "value": flt(utilised, 2)},
        {"label": "Applied leave",           "value": flt(applied, 2)},
        {"label": "Adjustments",             "value": 0},
        {"label": "Unpaid accrual",          "value": flt(unpaid, 2)},
        {"label": "Leave balance remaining", "value": flt(entitled + carry_over - utilised - expired - applied, 2)},
    ]

    history = frappe.get_all(
        "Leave Application",
        filters={"employee": employee, "docstatus": 1},
        fields=["name", "leave_type", "from_date", "to_date",
                "total_leave_days", "status"],
        order_by="from_date desc", limit=15,
    )

    annual_balance = None
    for row in other_balances:
        if (row["leave_type"] or "").strip().lower() == "annual leave":
            annual_balance = flt(row["balance"], 2); break
    if annual_balance is None:
        for row in other_balances:
            lt = (row["leave_type"] or "").strip().lower()
            if "annual" in lt and "unpaid" not in lt and "paid" not in lt.replace("unpaid", ""):
                annual_balance = flt(row["balance"], 2); break
    if annual_balance is None:
        annual_balance = flt(total_balance, 2)

    return {
        "overview": {
            "total_annual_balance": annual_balance,
            "closing_date":         f"31-12-{getdate().year}",
            "unpaid_leaves":        flt(unpaid, 2),
        },
        "annual_breakdown": breakdown,
        "other_balances":   other_balances,
        "history":          history,
    }


# ------------------------- documents -------------------------
def _get_documents(employee, emp):
    docs = []
    today = getdate()

    def _status(expiry):
        if not expiry:
            return "Valid"
        try:
            return "Expired" if getdate(expiry) < today else "Valid"
        except Exception:
            return "Valid"

    if emp.get("passport_number"):
        docs.append({
            "document_type":   "Passport",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("passport_number"),
            "issue_date":      emp.get("date_of_issue"),
            "expiry_date":     emp.get("valid_upto"),
            "place_of_issue":  emp.get("place_of_issue"),
            "status":          _status(emp.get("valid_upto")),
        })
    if emp.get("custom_qid_number"):
        qid_exp = emp.get("custom_valid_to") or emp.get("custom_qid_expiry")
        docs.append({
            "document_type":   "Qatar ID",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("custom_qid_number"),
            "issue_date":      None,
            "expiry_date":     qid_exp,
            "place_of_issue":  None,
            "status":          _status(qid_exp),
        })
    if emp.get("health_insurance_no"):
        hc_exp = emp.get("custom_health_certificate_expiry")
        docs.append({
            "document_type":   "Health Insurance",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("health_insurance_no"),
            "issue_date":      None,
            "expiry_date":     hc_exp,
            "place_of_issue":  emp.get("health_insurance_provider"),
            "status":          _status(hc_exp),
        })
    if emp.get("custom_visa_number"):
        docs.append({
            "document_type":   "Visa",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("custom_visa_number"),
            "issue_date":      None, "expiry_date": None, "place_of_issue": None,
            "status":          "Valid",
        })
    if emp.get("custom_sponsor_qideid"):
        docs.append({
            "document_type":   "Sponsor QID/EID",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("custom_sponsor_qideid"),
            "issue_date":      None, "expiry_date": None, "place_of_issue": None,
            "status":          "Valid",
        })
    if emp.get("custom_contract_expiry_date"):
        docs.append({
            "document_type":   "Contract",
            "name":            emp.get("employee_name"),
            "document_number": None, "issue_date": None,
            "expiry_date":     emp.get("custom_contract_expiry_date"),
            "place_of_issue":  None,
            "status":          _status(emp.get("custom_contract_expiry_date")),
        })
    return docs


# ------------------------- salary -------------------------
def _get_salary_data(ssa):
    if not ssa:
        return {"salary_structure": None, "from_date": None,
                "components": [], "total": 0}

    components, total = [], 0.0
    for label, field in SALARY_COMPONENTS:
        val = flt(ssa.get(field))
        if val:
            components.append({"label": label, "amount": val})
            total += val

    return {
        "salary_structure": ssa.get("salary_structure"),
        "from_date":        ssa.get("from_date"),
        "components":       components,
        "total":            flt(ssa.get("custom_total_salary")) or flt(total, 2),
    }


# ------------------------- tickets -------------------------
def _get_ticket_data(employee):
    extra = frappe.db.get_value(
        "Employee", employee,
        ["custom_frequency_in_months", "custom_destination",
         "custom_eligibility", "custom_amount"],
        as_dict=True
    ) or {}

    freq = cint(extra.get("custom_frequency_in_months"))

    last_date = None
    last_method = None
    ticket_count = 0
    ticket_amount = 0

    if frappe.db.exists("DocType", "Air Ticket Availment"):
        try:
            rows = frappe.db.sql("""
                SELECT
                    SUM(COALESCE(number_of_ticket, 0)) AS ticket_count,
                    SUM(COALESCE(amount, 0))           AS ticket_amount,
                    MAX(posting_date)                  AS last_ticket_date,
                    SUBSTRING_INDEX(
                        GROUP_CONCAT(availment_method
                            ORDER BY posting_date DESC, creation DESC),
                        ',', 1
                    )                                  AS last_availment_method
                FROM `tabAir Ticket Availment`
                WHERE docstatus = 1 AND employee = %(employee)s
            """, {"employee": employee}, as_dict=True)

            t = rows[0] if rows else {}
            ticket_count = flt(t.get("ticket_count"))
            ticket_amount = flt(t.get("ticket_amount"))
            last_date = t.get("last_ticket_date")
            last_method = t.get("last_availment_method")
        except Exception as ex:
            frappe.log_error(
                title="HR Dashboard – Air Ticket fetch failed",
                message=str(ex),
            )

    next_date = None
    if last_date and freq:
        try:
            next_date = add_months(last_date, freq)
        except Exception:
            next_date = None

    return {
        "ticket_count":          ticket_count,
        "ticket_amount":         ticket_amount,
        "last_ticket_date":      last_date,
        "last_availment_method": last_method,
        "frequency_months":      freq,
        "destination":           extra.get("custom_destination"),
        "eligibility":           extra.get("custom_eligibility"),
        "entitlement":           flt(extra.get("custom_amount")),
        "next_availment_date":   next_date,
    }