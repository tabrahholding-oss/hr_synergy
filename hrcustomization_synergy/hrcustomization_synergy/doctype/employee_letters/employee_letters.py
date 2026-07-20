


import frappe
from frappe.model.document import Document
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import attach_certificate_pdf
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import get_certificate_series_name

class EmployeeLetters(Document):
    def autoname(self):
        self.name = get_certificate_series_name(self, "certificate_type", "Employee Certificate")

    def on_update(self):
        if self.has_value_changed("status") and self.status == "Approved":
            print_format = get_print_format(self)
            attach_certificate_pdf(self, print_format)


BANK_FORMAT_MAP = {
    "QDC": "Salary Certificate QDC",
    "CBQ": "Salary Certificate CBQ",
    "CBQ Card": "Salary Certificate CBQ Card",
}

FORMAT_MAP = {
    "Employment Certificate": "Employment Certificate",
    "Experience Letter": "Experience Letter",
}


def get_print_format(doc):
    """certificate_type + bank k combination se sahi print format nikalta hai."""
    if doc.certificate_type == "Salary Certificate":
        if doc.bank and doc.bank in BANK_FORMAT_MAP:
            return BANK_FORMAT_MAP[doc.bank]
        return "Salary Certificate"
    return FORMAT_MAP.get(doc.certificate_type)
