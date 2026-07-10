import frappe
from frappe.model.document import Document

class CertificateRequestDetail(Document):
    def on_update(self):
        if self.has_value_changed("status") and self.status == "Approved":
            self.attach_certificate_pdf()

    def attach_certificate_pdf(self):
        format_map = {
            "Salary Certificate QDC": "Salary Certificate QDC",
            "Salary Certificate CBQ Card": "Salary Certificate CBQ Card",
            "Salary Certificate CBQ": "Salary Certificate CBQ",
            "Salary Certificate": "Salary Certificate",
            "Experience Letter": "Experience Letter",
            "Termination Letter": "Termination Letter",
            "Non Confirmation Letter": "Non Confirmation Letter",
            "Employment Certificate": "Employment Certificate",
            "Warning Letter": "Warning Letter",
            "Salary Increment": "Salary Increment Letter"
        }
        print_format = format_map.get(self.certificate_type)
        if not print_format:
            return

        existing = frappe.get_all(
            "File",
            filters={
                "attached_to_doctype": self.doctype,
                "attached_to_name": self.name,
                "file_name": ["like", f"%{self.name}%.pdf"]
            }
        )
        if existing:
            return

        pdf_content = frappe.get_print(
            self.doctype, self.name, print_format=print_format, as_pdf=True
        )

        file_doc = frappe.get_doc({
            "doctype": "File",
            "file_name": f"{self.name}-{print_format}.pdf",
            "attached_to_doctype": self.doctype,
            "attached_to_name": self.name,
            "content": pdf_content,
            "is_private": 1
        })
        file_doc.save(ignore_permissions=True)