# Copyright (c) 2024, Aadhil and contributors
# For license information, please see license.txt

import re
import frappe
from frappe.utils import flt
from frappe.model.naming import make_autoname


def get_wps_component_mappings():
    """Fetch all WPS component mappings from settings"""
    mappings = frappe.db.sql("""
        SELECT 
            field_name, 
            mapping_type, 
            salary_component, 
            formula,
            description
        FROM `tabWPS Salary Component Mapping`
        WHERE parent = 'WPS Settings'
        AND parenttype = 'WPS Settings'
        ORDER BY idx
    """, as_dict=True)
    
    return mappings


def safe_eval_expr(expr):
    """Safely evaluate mathematical expressions"""
    # Remove any non-numeric/operator characters for safety
    allowed_chars = "0123456789+-*/()."
    expr_clean = ''.join(c for c in str(expr) if c in allowed_chars or c.isspace())
    
    if not expr_clean or expr_clean.isspace():
        return 0
    
    try:
        # Evaluate the expression with restricted builtins
        return eval(expr_clean, {"__builtins__": {}}, {})
    except:
        return 0


def evaluate_formula(formula, salary_slip_name, calculated_values=None):
    """
    Evaluate formula with support for:
    - [Component Name] - fetch from salary details
    - Field references - use already calculated values
    - Basic math operations (+, -, *, /)
    - Special variables: NET_SALARY, TOTAL_DEDUCTION, etc.
    """
    if not formula:
        return 0
    
    calculated_values = calculated_values or {}
    formula_work = str(formula)
    
    # Replace [Component Names] with actual values
    component_pattern = r'\[([^\]]+)\]'
    components = re.findall(component_pattern, formula_work)
    
    for component in components:
        # Get sum of all salary details matching this component
        value = frappe.db.sql("""
            SELECT COALESCE(SUM(amount), 0) as total
            FROM `tabSalary Detail`
            WHERE parent = %s 
            AND salary_component = %s
        """, (salary_slip_name, component), as_dict=True)
        
        amount = value[0].total if value else 0
        formula_work = formula_work.replace(f"[{component}]", str(amount))
    
    # Replace field references (base_salary, housing_allowance, etc.)
    for field_name in ['base_salary', 'housing_allowance', 'food_allowance', 
                       'transportation_allowance', 'ot_allowance', 'extra_income']:
        if field_name in calculated_values:
            # Use word boundaries to avoid partial replacements
            formula_work = re.sub(r'\b' + field_name + r'\b', 
                                 str(calculated_values[field_name]), 
                                 formula_work)
    
    # Replace special variables
    special_vars = {
        'NET_SALARY': calculated_values.get('net_salary', 0),
        'TOTAL_DEDUCTION': calculated_values.get('total_deduction', 0),
        'BASIC': calculated_values.get('base_salary', 0),
        'GROSS_PAY': calculated_values.get('gross_pay', 0)
    }
    
    for var_name, var_value in special_vars.items():
        formula_work = formula_work.replace(var_name, str(var_value))
    
    try:
        # Safely evaluate mathematical expression
        result = safe_eval_expr(formula_work)
        return flt(result, 2)  # Round to 2 decimal places
    except Exception as e:
        frappe.log_error(
            f"Error evaluating WPS formula: {formula} -> {formula_work}", 
            f"WPS Formula Evaluation Error: {str(e)}"
        )
        return 0


def calculate_salary_breakdowns(row):
    """Calculate all salary components based on WPS mappings"""
    mappings = get_wps_component_mappings()
    
    # Initialize result with zeros
    result = {
        "base_salary": 0,
        "housing_allowance": 0,
        "food_allowance": 0,
        "transportation_allowance": 0,
        "ot_allowance": 0,
        "extra_income": 0,
        # Store special values for formula evaluation
        "net_salary": flt(row.get("net_salary", 0)),
        "total_deduction": flt(row.get("total_deduction", 0)),
        "gross_pay": flt(row.get("gross_pay", 0)) if row.get("gross_pay") else flt(row.get("net_salary", 0)) + flt(row.get("total_deduction", 0))
    }
    
    if not mappings:
        # Fallback to hardcoded logic if no mappings configured
        return calculate_salary_breakdowns_fallback(row)
    
    # Track which components have been mapped
    mapped_components = []
    
    # Process mappings in order
    for mapping in mappings:
        field_name = mapping.get('field_name')
        
        if not field_name or field_name not in result:
            continue
            
        if mapping.get('mapping_type') == "Single Component" and mapping.get('salary_component'):
            # Simple component mapping
            value = frappe.db.sql("""
                SELECT COALESCE(SUM(amount), 0) as total
                FROM `tabSalary Detail`
                WHERE parent = %s 
                AND salary_component = %s
            """, (row.get("name"), mapping.get('salary_component')), as_dict=True)
            
            result[field_name] = flt(value[0].total if value else 0, 2)
            mapped_components.append(mapping.get('salary_component'))
            
        elif mapping.get('mapping_type') == "Formula" and mapping.get('formula'):
            # Formula-based calculation
            result[field_name] = evaluate_formula(
                mapping.get('formula'), 
                row.get("name"),
                result
            )
            
        elif mapping.get('mapping_type') == "Remaining Balance":
            # Calculate remaining amount
            if mapping.get('formula'):
                # Use custom formula for remaining balance
                calculated_value = evaluate_formula(
                    mapping.get('formula'),
                    row.get("name"),
                    result
                )
            else:
                # Default: net_salary minus all mapped amounts
                mapped_total = sum([
                    result.get("base_salary", 0),
                    result.get("housing_allowance", 0),
                    result.get("food_allowance", 0),
                    result.get("transportation_allowance", 0),
                    result.get("ot_allowance", 0)
                ])
                
                calculated_value = flt(result.get("net_salary", 0) - mapped_total, 2)
            
            # For Remaining Balance, ensure value is not negative (set to 0 if negative)
            result[field_name] = max(0, calculated_value)
    
    # Remove special calculation fields from result
    for key in ['net_salary', 'total_deduction', 'gross_pay']:
        if key in result:
            del result[key]
    
    return result


def calculate_salary_breakdowns_fallback(row):
    """Fallback function using original hardcoded logic"""
    base = frappe.db.get_value(
        "Salary Detail", 
        {"parent": row.get("name"), "salary_component": ["like", "%Basic%"]}, 
        "Sum(amount)"
    ) or 0
    
    housing_allowance = frappe.db.get_value(
        "Salary Detail", 
        {"parent": row.get("name"), "salary_component": ["like", "%Housing Allowance%"]}, 
        "Sum(amount)"
    ) or 0
    
    food_allowance = frappe.db.get_value(
        "Salary Detail", 
        {"parent": row.get("name"), "salary_component": ["like", "%Food Allowance%"]}, 
        "Sum(amount)"
    ) or 0
    
    transportation_allowance = frappe.db.get_value(
        "Salary Detail", 
        {"parent": row.get("name"), "salary_component": ["like", "%Transportation Allowance%"]}, 
        "Sum(amount)"
    ) or 0
    
    # Calculate OT allowance (assuming it's a single component for fallback)
    ot_allowance = frappe.db.get_value(
        "Salary Detail",
        {"parent": row.get("name"), "salary_component": ["like", "%Overtime%"]},
        "Sum(amount)"
    ) or 0
    
    # Calculate remaining balance (ensure it's not negative)
    remaining_balance = flt(row.get("net_salary", 0)) - flt(base)
    remaining_balance = max(0, remaining_balance)  # Set to 0 if negative
    
    return {
        "base_salary": flt(base, 2),
        "housing_allowance": flt(housing_allowance, 2),
        "food_allowance": flt(food_allowance, 2),
        "transportation_allowance": flt(transportation_allowance, 2),
        "ot_allowance": flt(ot_allowance, 2),
        "extra_income": flt(remaining_balance, 2)
    }

@frappe.whitelist(allow_guest=True)
def attach_certificate_pdf(doc, print_format):
    """Common PDF-attach logic used by both Employee Letters and HR Letters.
    print_format: resolved print format name (string)."""
    if not print_format:
        return

    existing = frappe.get_all(
        "File",
        filters={
            "attached_to_doctype": doc.doctype,
            "attached_to_name": doc.name,
            "file_name": ["like", f"%{doc.name}%.pdf"]
        }
    )
    if existing:
        return

    pdf_content = frappe.get_print(
        doc.doctype, doc.name, print_format=print_format, as_pdf=True
    )

    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": f"{doc.name}-{print_format}.pdf",
        "attached_to_doctype": doc.doctype,
        "attached_to_name": doc.name,
        "content": pdf_content,
        "is_private": 1
    })
    file_doc.save(ignore_permissions=True)


@frappe.whitelist(allow_guest=True)
def get_certificate_series_name(doc, type_fieldname, type_doctype):
    """
    Builds a name like: HR-{TYPE_ABBR}-{COMPANY_ABBR}-{YEAR}-#####
    type_fieldname : fieldname on doc holding the letter/certificate type (Link)
    type_doctype   : master doctype the type field links to
                      (Employee Certificate / HR Certificate / Company Certificate)
    """
    letter_type = doc.get(type_fieldname)
    if not letter_type:
        frappe.throw("Please select a Letter/Certificate Type before saving.")

    type_abbr = frappe.db.get_value(type_doctype, letter_type, "abbr")
    if not type_abbr:
        frappe.throw(
            f"'{letter_type}' does not have an Abbreviation set in {type_doctype}. "
            f"Please ask HR/IT to set it."
        )

    if not doc.company:
        frappe.throw("Please select a Company before saving.")

    company_abbr = frappe.db.get_value("Company", doc.company, "abbr")
    if not company_abbr:
        frappe.throw(f"Company '{doc.company}' does not have an Abbr set.")

    year = frappe.utils.nowdate()[:4]
    key = f"HR-{type_abbr}-{company_abbr}-{year}-"
    return make_autoname(key + ".#####")


@frappe.whitelist(allow_guest=True)
def restrict_roster_access():
	"""Restrict /hr/roster page to users with the 'Shift' role only."""
	request = frappe.local.request
	if not request:
		return

	path = request.path or ""
	if not path.startswith("/hr/roster"):
		return

	user = frappe.session.user
	if user == "Administrator":
		return

	if "Shift" not in frappe.get_roles(user):
		frappe.throw(
			frappe._("You are not permitted to access this page."),
			frappe.PermissionError,
		)