frappe.ui.form.on('Overtime Arrears', {
    refresh(frm) {
        // optional refresh logic
    },

    fetch_overtime_records(frm) {
        if (!validate_dates(frm)) return;

        frm.clear_table("overtime_records");

        Promise.all([
            get_previous_overtime_records(),
            get_current_overtime_records(frm)
        ]).then(async ([previousOvertimeRecords, currentOvertimeRecords]) => {

            const previousKeySet = build_previous_ot_keyset(previousOvertimeRecords);

            // Filter out duplicates
            const newOvertimeRecords = currentOvertimeRecords.filter(row => {
                const key = `${row.employee}|${format_date(row.attendance_date)}`;
                return !previousKeySet.has(key);
            });

            if (!newOvertimeRecords.length) {
                show_no_overtime_message("No new overtime records found.");
                return;
            }

            // Fetch salaries in bulk
            const employeeSet = new Set(newOvertimeRecords.map(r => r.employee));
            const employeeSalaries = await get_employees_total_salary([...employeeSet]);

            // Add child rows
            newOvertimeRecords.forEach(row =>
                add_overtime_row(frm, row, employeeSalaries)
            );

            frm.refresh_field("overtime_records");

        }).catch(err => {
            frappe.msgprint({
                title: __("Error"),
                message: err.message || err,
                indicator: "red"
            });
        });
    }
});

// Helper Functions
function format_date(d) {
    if (!d) return "";
    return d.split(" ")[0];
}

function validate_dates(frm) {
    if (!frm.doc.from_date || !frm.doc.to_date) {
        frappe.msgprint("Please select From Date and To Date");
        return false;
    }
    return true;
}

function build_attendance_filters(frm) {
    const filters = [
        ["attendance_date", ">=", frm.doc.from_date],
        ["attendance_date", "<=", frm.doc.to_date]
    ];
    if (frm.doc.employee) filters.push(["employee", "=", frm.doc.employee]);
    return filters;
}

function has_overtime(row) {
    return (row.custom_normal_ot || 0) > 0 ||
           (row.custom_holiday_ot || 0) > 0 ||
           (row.custom_special_ot || 0) > 0;
}

function get_current_overtime_records(frm) {
    return frappe.db.get_list("Attendance", {
        fields: [
            "employee",
            "employee_name",
            "attendance_date",
            "working_hours",
            "custom_normal_ot",
            "custom_holiday_ot",
            "custom_special_ot"
        ],
        filters: build_attendance_filters(frm),
        limit: 1000
    }).then(records => records.filter(has_overtime));
}

function get_previous_overtime_records() {
    return frappe.db.get_list("Overtime Arrears", {
        fields: ["name"],
        filters: { docstatus: 1 },
        limit: 1000
    }).then(list => {
        if (!list.length) return [];

        const promises = list.map(d =>
            frappe.db.get_doc("Overtime Arrears", d.name)
                .then(doc => doc.overtime_records || [])
                .catch(() => [])
        );

        return Promise.all(promises).then(r => r.flat());
    }).catch(() => []);
}

function build_previous_ot_keyset(records) {
    const keySet = new Set();
    records.forEach(r => {
        keySet.add(`${r.employee}|${format_date(r.date)}`);
    });
    return keySet;
}

function get_employees_total_salary(employeeList) {
    return frappe.db.get_list("Salary Structure Assignment", {
        fields: ["employee", "custom_total_salary"],
        filters: { employee: ["in", employeeList], docstatus: 1 },
        order_by: "from_date desc",
        limit: 1000
    }).then(results => {
        const map = {};
        results.forEach(r => {
            if (!map[r.employee]) map[r.employee] = r.custom_total_salary;
        });
        return map;
    });
}

function add_overtime_row(frm, row, employeeSalaries) {
    const baseSalary = employeeSalaries[row.employee] || 0;
    const hourlySalary = (baseSalary / 30) / 8;

    frm.add_child("overtime_records", {
        employee: row.employee,
        employee_name: row.employee_name,
        date: row.attendance_date,
        working_hours: row.working_hours,
        normal_ot_hours: row.custom_normal_ot,
        holiday_ot_hours: row.custom_holiday_ot,
        special_ot_hours: row.custom_special_ot,
        total_ot_salary: calculate_ot_salary(hourlySalary, row)
    });
}

function calculate_ot_salary(hourlySalary, row) {
    return hourlySalary * (row.custom_normal_ot || 0) +
           hourlySalary * (row.custom_holiday_ot || 0) +
           hourlySalary * (row.custom_special_ot || 0);
}

function show_no_overtime_message(msg) {
    frappe.msgprint({
        title: __("No Overtime Found"),
        message: __(msg || "No overtime records found."),
        indicator: "orange"
    });
}