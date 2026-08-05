import frappe
from frappe.model.document import Document

class OvertimeSettings(Document):
    def validate(self):
        if self.daily_working_hours_threshold <= 0:
            frappe.throw("Daily Working Hours Threshold must be greater than 0")
        
        if self.weekly_working_hours_threshold <= 0:
            frappe.throw("Weekly Working Hours Threshold must be greater than 0")
        
        if self.minimum_ot_for_approval < 0:
            frappe.throw("Minimum OT for Approval cannot be negative")
        
        if self.daily_break_hours < 0:
            frappe.throw("Daily Break Hours cannot be negative")
        
        if self.daily_break_hours >= self.daily_working_hours_threshold:
            frappe.throw("Daily Break Hours cannot be equal to or greater than Daily Working Hours Threshold")
        
        # Validate minimum overtime thresholds
        if self.minimum_normal_ot < 0:
            frappe.throw("Minimum Normal OT cannot be negative")
        
        if self.minimum_holiday_ot < 0:
            frappe.throw("Minimum Holiday OT cannot be negative")
        
        if self.minimum_special_ot < 0:
            frappe.throw("Minimum Special OT cannot be negative")
        
        # Reasonable upper limits (24 hours)
        if self.minimum_normal_ot > 24:
            frappe.throw("Minimum Normal OT cannot exceed 24 hours")
        
        if self.minimum_holiday_ot > 24:
            frappe.throw("Minimum Holiday OT cannot exceed 24 hours")
        
        if self.minimum_special_ot > 24:
            frappe.throw("Minimum Special OT cannot exceed 24 hours")