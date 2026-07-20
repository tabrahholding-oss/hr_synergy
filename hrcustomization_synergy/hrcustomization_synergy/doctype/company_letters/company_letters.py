import frappe
from frappe.model.document import Document
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import attach_certificate_pdf
from hrcustomization_synergy.hrcustomization_synergy.wps_utils import get_certificate_series_name
FORMAT_MAP = {
        "Internal Memos": "Internal Memos",
        "Offers": "Offers",
        "Circulars": "Circulars"
}

class CompanyLetters(Document):
	def on_update(self):
		if self.has_value_changed("status") and self.status == "Approved":
			attach_certificate_pdf(self, FORMAT_MAP)
            
	def autoname(self):
		self.name = get_certificate_series_name(self, "letter_type", "Company Certificate")
        