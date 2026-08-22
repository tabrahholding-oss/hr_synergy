import frappe
from frappe import _


DOCTYPES = ["Employee Letters", "HR Letters", "Company Letters"]

EMPLOYEE_BANK_FORMAT_MAP = {
    "QDC": "Salary Certificate QDC",
    "CBQ": "Salary Certificate CBQ",
    "CBQ Card": "Salary Certificate CBQ Card",
}
EMPLOYEE_FORMAT_MAP = {
    "Employment Certificate": "Employment Certificate",
    "Experience Letter": "Experience Letter",
}
HR_FORMAT_MAP = {
    "Termination Letter": "Termination Letter",
    "Non Confirmation Letter": "Non Confirmation Letter",
    "Employment Certificate": "Employment Certificate",
    "Warning Letter": "Warning Letter",
    "Salary Increment": "Salary Increment Letter",
    "Asset Declaration": "Asset Declaration",
    "Employee Clearance Acknowledgement": "Employee Clearance Acknowledgement",
    "Employee Confirmation": "Employee Confirmation",
    "Employee Travel NOC": "Employee Travel NOC",
}


def _resolve_print_format(doctype, row):
    if doctype == "Employee Letters":
        if row.get("certificate_type") == "Salary Certificate":
            bank = row.get("bank")
            return EMPLOYEE_BANK_FORMAT_MAP.get(bank, "Salary Certificate")
        return EMPLOYEE_FORMAT_MAP.get(row.get("certificate_type"))

    if doctype == "HR Letters":
        return HR_FORMAT_MAP.get(row.get("certificate_type"))

    if doctype == "Company Letters":
        return row.get("letter_type")

    return None


def _type_field(doctype):
    return "letter_type" if doctype == "Company Letters" else "certificate_type"


def _effective_status(row):
    return row.get("workflow_state") or row.get("status") or "Draft"


@frappe.whitelist()
def get_dashboard_data(doctype_filter=None, company=None, employee=None, type_filter=None,
                        status_filter=None, from_date=None, to_date=None, search=None):
    if not any(frappe.has_permission(dt, "read") for dt in DOCTYPES):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    targets = [doctype_filter] if doctype_filter else DOCTYPES

    all_rows = []
    for dt in targets:
        if dt not in DOCTYPES:
            continue
        if not frappe.has_permission(dt, "read"):
            continue

        # Company Letters mein employee field hi nahi hai — employee filter
        # lagne par ye doctype skip karo
        if employee and dt == "Company Letters":
            continue

        tfield = _type_field(dt)
        filters = {}
        if company:
            filters["company"] = company
        if employee and dt in ("Employee Letters", "HR Letters"):
            filters["employee"] = employee
        if type_filter:
            filters[tfield] = type_filter
        if from_date and to_date:
            filters["creation"] = ["between", [from_date, to_date]]

        fieldnames = ["name", "status", "workflow_state", "company",
                      "creation", "modified", tfield]
        if dt in ("Employee Letters", "HR Letters"):
            fieldnames += ["employee", "employee_name"]
        if dt == "Employee Letters":
            fieldnames += ["bank"]
        if dt == "Company Letters":
            fieldnames += ["department"]

        rows = frappe.get_all(dt, filters=filters, fields=fieldnames,
                               order_by="creation desc", limit=500)

        for r in rows:
            r["doctype"] = dt
            r["certificate_type"] = r.get(tfield)
            r["party"] = r.get("employee_name") or r.get("company")
            r["print_format"] = _resolve_print_format(dt, r)
            r["display_status"] = _effective_status(r)

            if status_filter and r["display_status"] != status_filter:
                continue

            if search:
                s = search.lower()
                hay = " ".join(str(r.get(k) or "") for k in
                                ("name", "party", "certificate_type", "display_status")).lower()
                if s not in hay:
                    continue

            all_rows.append(r)

    all_rows.sort(key=lambda x: x["creation"], reverse=True)

    approved = len([r for r in all_rows if r["display_status"] == "Approved"])
    rejected = len([r for r in all_rows if r["display_status"] == "Rejected"])
    draft = len([r for r in all_rows if r["display_status"] == "Draft"])
    total = len(all_rows)
    pending = total - approved - rejected - draft

    kpis = {
        "total": total,
        "draft": draft,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
    }

    type_counts = {}
    for r in all_rows:
        k = r["certificate_type"] or "Unknown"
        type_counts[k] = type_counts.get(k, 0) + 1
    type_chart = sorted(type_counts.items(), key=lambda x: -x[1])[:10]

    status_counts = {}
    for r in all_rows:
        status_counts[r["display_status"]] = status_counts.get(r["display_status"], 0) + 1

    return {
        "rows": all_rows,
        "kpis": kpis,
        "charts": {
            "by_type": {"labels": [x[0] for x in type_chart], "data": [x[1] for x in type_chart]},
            "by_status": {"labels": list(status_counts.keys()), "data": list(status_counts.values())},
        },
        "meta": {
            "doctypes": DOCTYPES,
            "types_by_doctype": _all_type_options(),
            "companies": frappe.get_all("Company", pluck="name", order_by="name"),
            "generated_on": frappe.utils.now(),
        },
    }


def _all_type_options():
    result = {}
    result["Employee Letters"] = sorted(set(
        frappe.get_all("Employee Letters", pluck="certificate_type", distinct=True)
    ))
    result["HR Letters"] = sorted(set(
        frappe.get_all("HR Letters", pluck="certificate_type", distinct=True)
    ))
    result["Company Letters"] = sorted(set(
        frappe.get_all("Company Letters", pluck="letter_type", distinct=True)
    ))
    return result


@frappe.whitelist()
def search_employees(txt=None, limit=20):
    """Employee dropdown ke liye searchable list (name + employee_name)."""
    filters = {}
    if txt:
        filters = [
            ["Employee", "employee_name", "like", f"%{txt}%"]
        ]
    rows = frappe.get_all(
        "Employee",
        filters=filters if txt else {},
        or_filters=[["name", "like", f"%{txt}%"]] if txt else None,
        fields=["name", "employee_name"],
        limit_page_length=limit,
        order_by="employee_name asc",
    )
    return rows


@frappe.whitelist()
def get_print_url(doctype, docname, preview=0):
    if doctype not in DOCTYPES:
        frappe.throw(_("Invalid doctype"))
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tfield = _type_field(doctype)
    fields = [tfield, "bank"] if doctype == "Employee Letters" else [tfield]
    row = frappe.db.get_value(doctype, docname, fields, as_dict=True)
    if not row:
        frappe.throw(_("Document not found"))

    row_dict = dict(row)
    row_dict["certificate_type"] = row_dict.get(tfield)
    print_format = _resolve_print_format(doctype, row_dict)
    if not print_format:
        frappe.throw(_("No print format mapped for this type"))

    url = (frappe.utils.get_url() +
           "/printview?doctype=" + frappe.utils.quote(doctype) +
           "&name=" + frappe.utils.quote(docname) +
           "&format=" + frappe.utils.quote(print_format) +
           "&no_letterhead=0")

    if int(preview or 0):
        url += "&preview=1"

    return {"url": url, "print_format": print_format}
