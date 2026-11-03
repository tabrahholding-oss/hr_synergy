# -*- coding: utf-8 -*-
"""
App-level setup functions — run on after_migrate.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


EMPLOYEE_EXPLORER_PAGE = "employee-explorer"
EMPLOYEE_EXPLORER_ROLES = ["Employee Explorer User", "System Manager"]

MARKETING_CAMPAIGN_CUSTOM_FIELDS = {
    "Material Request": [
        {
            "fieldname": "marketing_campaign_request",
            "label": "Marketing Campaign Request",
            "fieldtype": "Link",
            "options": "Marketing Campaign Request",
            "insert_after": "company",
            "no_copy": 1,
            "print_hide": 1,
        }
    ],
    "Purchase Order": [
        {
            "fieldname": "marketing_campaign_request",
            "label": "Marketing Campaign Request",
            "fieldtype": "Link",
            "options": "Marketing Campaign Request",
            "insert_after": "project",
            "no_copy": 1,
            "print_hide": 1,
        }
    ],
    "Purchase Invoice": [
        {
            "fieldname": "marketing_campaign_request",
            "label": "Marketing Campaign Request",
            "fieldtype": "Link",
            "options": "Marketing Campaign Request",
            "insert_after": "project",
            "no_copy": 1,
            "print_hide": 1,
        }
    ],
    "Expense Claim": [
        {
            "fieldname": "marketing_campaign_request",
            "label": "Marketing Campaign Request",
            "fieldtype": "Link",
            "options": "Marketing Campaign Request",
            "insert_after": "project",
            "no_copy": 1,
            "print_hide": 1,
        }
    ],
    "Journal Entry": [
        {
            "fieldname": "marketing_campaign_request",
            "label": "Marketing Campaign Request",
            "fieldtype": "Link",
            "options": "Marketing Campaign Request",
            "insert_after": "company",
            "no_copy": 1,
            "print_hide": 1,
        }
    ],
    "Payment Request": [
        {
            "fieldname": "marketing_campaign_request",
            "label": "Marketing Campaign Request",
            "fieldtype": "Link",
            "options": "Marketing Campaign Request",
            "insert_after": "project",
            "no_copy": 1,
            "print_hide": 1,
        }
    ],
}


def create_employee_explorer_page():
    """
    Employee Explorer page ko programmatically create ya update karta hai.
    Fixture approach kaam nahi karti kyunki Frappe standard pages ko
    non-developer mode mein insert nahi karta.
    """
    try:
        _ensure_page()
        _ensure_roles()
        frappe.db.commit()
    except Exception as ex:
        frappe.log_error(
            title="Employee Explorer setup failed",
            message=str(ex),
        )


def setup_marketing_campaign_custom_fields():
    create_custom_fields(MARKETING_CAMPAIGN_CUSTOM_FIELDS, ignore_validate=True)


def ensure_marketing_campaign_roles():
    for role in ("Marketing Manager", "Marketing User"):
        if not frappe.db.exists("Role", role):
            doc = frappe.new_doc("Role")
            doc.role_name = role
            doc.desk_access = 1
            doc.is_custom = 1
            doc.insert(ignore_permissions=True)


def _ensure_page():
    """Page record create/update karein + roles attach karein."""

    # Page exist karta hai?
    if frappe.db.exists("Page", EMPLOYEE_EXPLORER_PAGE):
        doc = frappe.get_doc("Page", EMPLOYEE_EXPLORER_PAGE)
    else:
        doc = frappe.new_doc("Page")
        doc.page_name = EMPLOYEE_EXPLORER_PAGE
        doc.title = "Employee Explorer"

    # Standard settings
    doc.module       = "Hrcustomization Synergy"
    doc.standard     = "Yes"
    doc.system_page  = 0
    doc.content      = None

    # Roles table rebuild
    doc.roles = []
    for role in EMPLOYEE_EXPLORER_ROLES:
        if frappe.db.exists("Role", role):
            doc.append("roles", {"role": role})

    # Developer mode bypass — warna "Not in Developer Mode" error aata hai
    doc.flags.ignore_permissions = True
    doc.flags.ignore_validate     = True
    doc.flags.ignore_mandatory    = True

    if doc.is_new():
        doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
    else:
        doc.save(ignore_permissions=True)

    return doc


def _ensure_roles():
    """Roles ensure karein ke exist karti hain."""
    for role in EMPLOYEE_EXPLORER_ROLES:
        if not frappe.db.exists("Role", role):
            # System Manager core role hai — create nahi karni
            if role == "System Manager":
                continue
            r = frappe.new_doc("Role")
            r.role_name  = role
            r.desk_access = 1
            r.is_custom   = 1
            r.flags.ignore_permissions = True
            r.insert(ignore_permissions=True)