import frappe
from frappe.model.document import Document
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import attach_certificate_pdf
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import get_certificate_series_name


FORMAT_MAP = {
    "Termination Letter": "Termination Letter",
    "Non Confirmation Letter": "Non Confirmation Letter",
    "Employment Certificate": "Employment Certificate",
    "Warning Letter": "Warning Letter",
    "Salary Increment": "Salary Increment Letter",
}


class HRLetters(Document):
    def on_update(self):
        if self.has_value_changed("status") and self.status == "Approved":
            attach_certificate_pdf(self, FORMAT_MAP)

    def autoname(self):
        self.name = get_certificate_series_name(self, "certificate_type", "HR Certificate")