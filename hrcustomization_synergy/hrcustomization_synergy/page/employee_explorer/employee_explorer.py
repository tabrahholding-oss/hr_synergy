# -*- coding: utf-8 -*-
"""
Employee Explorer  ->  Backend API
Place at: your_app/api/employee_explorer.py
"""

import frappe
from frappe import _
from frappe.utils import (
    getdate, date_diff, flt, cint, nowdate, add_days, add_months, format_date
)

# ---------------------------------------------------------------
# CONFIG  (apne leave types / field names yahan adjust kar lein)
# ---------------------------------------------------------------
UNPAID_LEAVE_TYPES = [
    "Annual Leave (Un Paid)",
    "Leave Without Pay",
    "Extended leave (Unpaid)",
]

# Salary Structure Assignment field -> display label
SALARY_COMPONENTS = [
    ("Basic",                 "base"),
    ("Housing",               "custom_hra"),
    ("Transportation",        "custom_living_allowance"),
    ("Special Allowance",     "custom_special_allowance"),
    ("Other Allowance",       "custom_other_allowance"),
    ("Performance Allowance", "custom_performance_allowance"),
]

# ===============================================================
# 4. EMPLOYEE SALARY SLIPS  (Salary Payout tab)
# ===============================================================

@frappe.whitelist()
def get_employee_salary_slips(employee, limit=100):
    """Us employee ki saari submitted Salary Slips ka detail."""
    if not employee:
        frappe.throw(_("Employee is required"))

    slips = frappe.db.sql("""
        SELECT
            ss.name, ss.posting_date, ss.start_date, ss.end_date,
            ss.payment_days, ss.gross_pay, ss.total_deduction,
            ss.net_pay, ss.year_to_date, ss.bank_name, ss.bank_account_no,
            ss.company, ss.department, ss.designation, ss.currency,
            ss.status, ss.leave_without_pay
        FROM `tabSalary Slip` ss
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
# HELPERS
# ===============================================================

def _service_period(date_of_joining, as_on=None):
    """Current date - date_of_joining  =>  Years / Months / Days"""
    as_on = getdate(as_on or nowdate())
    doj = getdate(date_of_joining) if date_of_joining else None

    if not doj or as_on < doj:
        return {"days": 0, "years": 0, "months": 0, "rem_days": 0,
                "text": "0 Years, 0 Months, 0 Days"}

    total_days = date_diff(as_on, doj)

    years = as_on.year - doj.year
    months = as_on.month - doj.month
    days = as_on.day - doj.day

    if days < 0:
        months -= 1
        days += add_days(as_on.replace(day=1), -1).day
    if months < 0:
        years -= 1
        months += 12

    return {
        "days": total_days,
        "years": years,
        "months": months,
        "rem_days": days,
        "text": f"{years} Years, {months} Months, {days} Days",
    }


def _gratuity(basic_salary, date_of_joining, as_on=None):
    """
    Gratuity formula:
      if  date_diff(today, doj) < 1826 :
            basic * 0.7 * date_diff(today, doj) / 365
      else:
            basic * date_diff(today, doj) / 365
    """
    as_on = getdate(as_on or nowdate())
    doj = getdate(date_of_joining) if date_of_joining else None
    basic = flt(basic_salary)

    if not doj or basic <= 0:
        return 0.0

    days = date_diff(as_on, doj)
    if days <= 0:
        return 0.0

    if days < 1826:      # less than 5 years
        return flt(basic * 0.7 * days / 365.0, 2)
    return flt(basic * days / 365.0, 2)


def _latest_ssa(employee):
    """Current (latest submitted) Salary Structure Assignment"""
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
# 1. DASHBOARD  (cards + charts)
# ===============================================================

@frappe.whitelist()
def get_dashboard():
    total  = frappe.db.count("Employee")
    active = frappe.db.count("Employee", {"status": "Active"})
    left   = frappe.db.count("Employee", {"status": "Left"})

    by_department = frappe.db.sql("""
        SELECT IFNULL(department, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee`
        WHERE IFNULL(status,'') != 'Left'
        GROUP BY department
        ORDER BY value DESC
        LIMIT 8
    """, as_dict=True)

    by_gender = frappe.db.sql("""
        SELECT IFNULL(gender, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee`
        WHERE IFNULL(status,'') != 'Left'
        GROUP BY gender
    """, as_dict=True)

    by_designation = frappe.db.sql("""
        SELECT IFNULL(designation, 'Not Set') AS label, COUNT(*) AS value
        FROM `tabEmployee`
        WHERE IFNULL(status,'') != 'Left'
        GROUP BY designation
        ORDER BY value DESC
        LIMIT 8
    """, as_dict=True)

    return {
        "cards": {
            "total": total,
            "active": active,
            "left": left,
            "departments": len(by_department),
        },
        "by_department": by_department,
        "by_gender": by_gender,
        "by_designation": by_designation,
    }


# ===============================================================
# 2. EMPLOYEE LIST  (search / filter)
# ===============================================================

@frappe.whitelist()
def get_employees(search=None, department=None, status=None, limit=300):
    cond = ["1 = 1"]
    vals = {"limit": cint(limit) or 300}

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
        cond.append("e.department = %(department)s")
        vals["department"] = department

    if status:
        cond.append("e.status = %(status)s")
        vals["status"] = status

    where = " AND ".join(cond)

    return frappe.db.sql(f"""
        SELECT
            e.name, e.employee_name, e.employee_number,
            e.designation, e.department, e.company, e.branch,
            e.status, e.date_of_joining, e.cell_number,
            e.personal_email, e.company_email, e.image,
            e.custom_qid_number, e.custom_valid_to, e.gender
        FROM `tabEmployee` e
        WHERE {where}
        ORDER BY e.employee_name
        LIMIT %(limit)s
    """, vals, as_dict=True)


# ===============================================================
# 3. FULL EMPLOYEE PROFILE
# ===============================================================

@frappe.whitelist()
def get_employee_profile(employee):
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
        "service": _service_period(doj),
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

    led  = {r.leave_type: r for r in ledger}
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
            "eligible": flt(eligible, 2),
            "utilized": flt(utilized, 2),
            "balance":  flt(balance, 2),
        })
        total_balance += balance

    # ---- annual breakdown ----
    carry_over = sum(flt(r.get("carry_forward")) for r in ledger)
    entitled   = sum(flt(r.get("allocated"))     for r in ledger)
    expired    = sum(flt(r.get("expired"))       for r in ledger)
    utilised   = sum(flt(r.get("used"))          for r in ledger)
    applied    = sum(flt(r.get("pending"))       for r in pending)

    breakdown = [
        {"label": "Carry over",             "value": flt(carry_over, 2)},
        {"label": "Entitled Leave",         "value": flt(entitled, 2)},
        {"label": "Utilised Leave",         "value": flt(utilised, 2)},
        {"label": "Applied leave",          "value": flt(applied, 2)},
        {"label": "Adjustments",            "value": 0},
        {"label": "Unpaid accrual",         "value": flt(unpaid, 2)},
        {"label": "Leave balance remaining","value": flt(entitled + carry_over - utilised - expired - applied, 2)},
    ]

    history = frappe.get_all(
        "Leave Application",
        filters={"employee": employee, "docstatus": 1},
        fields=["name", "leave_type", "from_date", "to_date",
                "total_leave_days", "status"],
        order_by="from_date desc",
        limit=15,
    )


    annual_balance = None
    for row in other_balances:
        if (row["leave_type"] or "").strip().lower() == "annual leave":
            annual_balance = flt(row["balance"], 2)
            break

    if annual_balance is None:
        for row in other_balances:
            lt = (row["leave_type"] or "").strip().lower()
            if "annual" in lt and "unpaid" not in lt and "paid" not in lt.replace("unpaid", ""):
                annual_balance = flt(row["balance"], 2)
                break

    if annual_balance is None:
        annual_balance = flt(total_balance, 2)

    return {
        "overview": {
            "total_annual_balance": annual_balance,
            "closing_date":         f"31-12-{getdate().year}",
            "unpaid_leaves":        flt(unpaid, 2),
        },
        # annual_breakdown ab JS mein use nahi hoga — hata sakte hain,
        # lekin safety ke liye rakha hai
        "annual_breakdown": breakdown,
        "other_balances":   other_balances,
        "history":          history,
    }


# ------------------------- documents -------------------------

# ------------------------- documents -------------------------

# ------------------------- documents -------------------------

def _get_documents(employee, emp):
    """
    Employee Documents section.
    'Employee Document' DocType exist nahi karta, is liye Employee ke
    custom fields se directly data nikalte hain.
    """
    docs = []
    today = getdate()

    def _status(expiry):
        if not expiry:
            return "Valid"
        try:
            return "Expired" if getdate(expiry) < today else "Valid"
        except Exception:
            return "Valid"

    # ---------- Passport ----------
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

    # ---------- Qatar ID ----------
    if emp.get("custom_qid_number"):
        # expiry: custom_valid_to preferred, warna custom_qid_expiry
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

    # ---------- Health Insurance / Health Certificate ----------
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

    # ---------- Visa ----------
    if emp.get("custom_visa_number"):
        docs.append({
            "document_type":   "Visa",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("custom_visa_number"),
            "issue_date":      None,
            "expiry_date":     None,   # koi visa expiry field nahi mila
            "place_of_issue":  None,
            "status":          "Valid",
        })

    # ---------- Sponsor QID/EID ----------
    if emp.get("custom_sponsor_qideid"):
        docs.append({
            "document_type":   "Sponsor QID/EID",
            "name":            emp.get("employee_name"),
            "document_number": emp.get("custom_sponsor_qideid"),
            "issue_date":      None,
            "expiry_date":     None,
            "place_of_issue":  None,
            "status":          "Valid",
        })

    # ---------- Contract Expiry ----------
    if emp.get("custom_contract_expiry_date"):
        docs.append({
            "document_type":   "Contract",
            "name":            emp.get("employee_name"),
            "document_number": None,
            "issue_date":      None,
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
        "from_date": ssa.get("from_date"),
        "components": components,
        "total": flt(ssa.get("custom_total_salary")) or flt(total, 2),
    }


# ------------------------- tickets -------------------------

# ------------------------- tickets -------------------------

def _get_ticket_data(employee):
    """
    Air Ticket data nikalta hai:
      - Employee custom fields : custom_frequency_in_months, custom_destination,
                                 custom_eligibility, custom_amount
      - Air Ticket Availment   : availment_method, number_of_ticket, amount,
                                 posting_date, eligible_amount, frequency
    """
    empty = {
        "ticket_count":          0,
        "ticket_amount":         0,
        "last_ticket_date":      None,
        "last_availment_method": None,
        "frequency_months":      0,
        "destination":           None,
        "eligibility":           None,
        "entitlement":           0,
        "next_availment_date":   None,
    }

    # ---------- Employee-side entitlement fields ----------
    extra = frappe.db.get_value(
        "Employee", employee,
        ["custom_frequency_in_months", "custom_destination",
         "custom_eligibility", "custom_amount"],
        as_dict=True
    ) or {}

    freq = cint(extra.get("custom_frequency_in_months"))

    # ---------- Air Ticket Availment history ----------
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
                        GROUP_CONCAT(
                            availment_method
                            ORDER BY posting_date DESC, creation DESC
                        ),
                        ',', 1
                    )                                  AS last_availment_method
                FROM `tabAir Ticket Availment`
                WHERE docstatus = 1
                  AND employee = %(employee)s
            """, {"employee": employee}, as_dict=True)

            t = rows[0] if rows else {}
            ticket_count = flt(t.get("ticket_count"))
            ticket_amount = flt(t.get("ticket_amount"))
            last_date = t.get("last_ticket_date")
            last_method = t.get("last_availment_method")
        except Exception as ex:
            frappe.log_error(
                title="Employee Explorer – Air Ticket fetch failed",
                message=str(ex),
            )

    # ---------- Next availment date = last_date + frequency ----------
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