frappe.pages['financial-overview'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Financial Overview',
		single_column: true
	});

	new FinancialOverview(page);
};

class FinancialOverview {
	constructor(page) {
		this.page = page;
		this.method = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_dashboard_data';
		this.method_statement = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_pl_statement_data';
		this.method_trends = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_trends_data';
		this.method_costs = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_costs_data';
		this.method_bs_statement = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_bl_statement_data';
		this.method_ratios = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_financial_ratios_data';
		this.method_pl_flow = 'hrcustomization_synergy.hrcustomization_synergy.page.financial_overview.financial_overview.get_pl_flow_data';

		this.data = null;
		this.statement_data = null;
		this.bs_statement_data = null;
		this.trends_data = null;
		this.costs_data = null;
		this.ratios_data = null;
		this.pl_flow_data = null;

		this.active_tab = 'overview';
		this.active_statement_view = 'pl';
		this.active_trend_view = 'revenue';
		this.active_bridge_view = 'ebit';
		this.active_pl_flow_view = 'summary';
		this.bridge_popup_open = false;

		this.request_id = 0;
		this.inject_styles();
		this.setup_filters();
	}

	setup_filters() {
		const default_company = frappe.defaults.get_user_default('Company') || '';
		this.create_filter_bar();

		Promise.all([this.load_companies()]).then(() => {
			const company_names = this.company_options || [];
			const selected_company = default_company && company_names.includes(default_company) ? default_company : (company_names[0] || '');
			if (selected_company) { this.company_control.set_value(selected_company); }
			this.set_default_dates();
			this.load_active_tab();
		}).catch(error => {
			console.error('Financial Overview filters failed to load', error);
			this.render_error(error);
		});
	}

	create_filter_bar() {
		$(this.page.wrapper).find('.fo-filter-bar').remove();

		this.$filter_bar = $(`
			<div class="fo-filter-bar">
				<div class="fo-filter-field fo-filter-company">
					<div class="fo-filter-label">${__('Company')}</div>
					<div class="fo-filter-control" data-field="company">
						<select class="fo-native-select" id="fo-company-select">
							<option value="">${__('Loading companies...')}</option>
						</select>
					</div>
				</div>
				<div class="fo-filter-field fo-filter-from-date">
					<div class="fo-filter-label">${__('From Date')}</div>
					<div class="fo-filter-control" data-field="from_date"></div>
				</div>
				<div class="fo-filter-field fo-filter-to-date">
					<div class="fo-filter-label">${__('To Date')}</div>
					<div class="fo-filter-control" data-field="to_date"></div>
				</div>
				<button type="button" class="btn fo-refresh-btn">
					${__('Refresh')}
				</button>
			</div>
		`);

		const $page_head = $(this.page.wrapper).find('.page-head').first();
		if ($page_head.length) { $page_head.after(this.$filter_bar); } else { $(this.page.wrapper).prepend(this.$filter_bar); }

		const $company = this.$filter_bar.find('#fo-company-select');

		this.company_control = {
			get_value: () => $company.val() || '',
			set_value: value => { $company.val(value || ''); }
		};

		const self = this;

		this.from_date_control = frappe.ui.form.make_control({
			parent: this.$filter_bar.find('[data-field="from_date"]'),
			df: { fieldtype: 'Date', fieldname: 'from_date', placeholder: 'dd/mm/yyyy', reqd: 1, change: function () { self.load_active_tab(); } },
			render_input: true,
		});
		this.from_date_control.refresh();

		this.to_date_control = frappe.ui.form.make_control({
			parent: this.$filter_bar.find('[data-field="to_date"]'),
			df: { fieldtype: 'Date', fieldname: 'to_date', placeholder: 'dd/mm/yyyy', reqd: 1, change: function () { self.load_active_tab(); } },
			render_input: true,
		});
		this.to_date_control.refresh();

		$company.on('change', () => this.on_company_change());
		this.$filter_bar.find('.fo-refresh-btn').on('click', () => this.load_active_tab());
	}

	load_companies() {
		return frappe.db.get_list('Company', { fields: ['name'], order_by: 'name asc', limit: 500 }).then(rows => {
			this.company_options = (rows || []).map(row => row.name);
			const $select = this.$filter_bar.find('#fo-company-select');
			$select.empty().append(`<option value="">${__('Select Company')}</option>`);
			this.company_options.forEach(name => {
				$select.append($('<option>', { value: name, text: name }));
			});
		});
	}

	set_default_dates() {
		const today = frappe.datetime.get_today();
		frappe.db.get_list('Fiscal Year', {
			fields: ['name', 'year_start_date', 'year_end_date'],
			filters: [['year_start_date', '<=', today], ['year_end_date', '>=', today]],
			limit: 1, order_by: 'year_start_date desc',
		}).then(rows => {
			let from_d, to_d;
			if (rows && rows.length) { from_d = rows[0].year_start_date; to_d = rows[0].year_end_date; }
			else { const y = new Date().getFullYear(); from_d = y + '-01-01'; to_d = y + '-12-31'; }
			this.from_date_control.set_value(from_d);
			this.to_date_control.set_value(to_d);
		}).catch(() => {
			const y = new Date().getFullYear();
			this.from_date_control.set_value(y + '-01-01');
			this.to_date_control.set_value(y + '-12-31');
		});
	}

	on_company_change() { this.load_active_tab(); }

	load_active_tab() {
		if (this.active_tab === 'statement') {
			if (this.active_statement_view === 'bs') { this.load_bs_statement(); }
			else if (this.active_statement_view === 'ratios') { this.load_ratios(); }
			else { this.load_statement(); }
		} else if (this.active_tab === 'trends') {
			if (this.active_trend_view === 'costs') { this.load_costs(); }
			else { this.load_trends(); }
		} else if (this.active_tab === 'pl_flow') {
			this.load_pl_flow();
		} else {
			this.load();
		}
	}

	switch_tab(tab) {
		if (tab === this.active_tab && tab !== 'trends' && tab !== 'statement' && tab !== 'pl_flow') { return; }
		this.active_tab = tab;
		this.ensure_shell();

		if (tab === 'statement') {
			if (this.active_statement_view === 'bs') { if (this.bs_statement_data) { this.render_bs_statement(); } else { this.load_bs_statement(); } }
			else if (this.active_statement_view === 'ratios') { if (this.ratios_data) { this.render_ratios(); } else { this.load_ratios(); } }
			else { if (this.statement_data) { this.render_statement(); } else { this.load_statement(); } }
		} else if (tab === 'trends') {
			if (this.active_trend_view === 'costs') { if (this.costs_data) { this.render_costs(); } else { this.load_costs(); } }
			else { if (this.trends_data) { this.render_trends(); } else { this.load_trends(); } }
		} else if (tab === 'pl_flow') {
			if (this.pl_flow_data) { this.render_pl_flow(); } else { this.load_pl_flow(); }
		} else {
			if (this.data) { this.render_overview(); } else { this.load(); }
		}
	}

	ensure_shell() {
		let $shell = $(this.page.body).find('.fo-shell');
		if (!$shell.length) {
			$(this.page.body).html(`
				<div class="fo-shell">
					<div class="fo-sidenav">
						<div class="fo-sidenav-item" data-tab="overview">${__('Overview')}</div>
						<div class="fo-sidenav-item" data-tab="statement">${__('Statements')}</div>
						<div class="fo-sidenav-item" data-tab="trends">${__('Trends')}</div>
						<div class="fo-sidenav-item" data-tab="pl_flow">${__('P&L Flow')}</div>
					</div>
					<div class="fo-shell-content"></div>
				</div>
			`);
			$shell = $(this.page.body).find('.fo-shell');
			$shell.find('.fo-sidenav-item').on('click', (e) => {
				const tab = $(e.currentTarget).data('tab');
				this.switch_tab(tab);
			});
		}
		$shell.find('.fo-sidenav-item').removeClass('fo-sidenav-active');
		$shell.find(`.fo-sidenav-item[data-tab="${this.active_tab}"]`).addClass('fo-sidenav-active');
		return $shell.find('.fo-shell-content');
	}

	load() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.data = r.message; this.render_overview(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	load_statement() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method_statement,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.statement_data = r.message; this.render_statement(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	load_bs_statement() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method_bs_statement,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.bs_statement_data = r.message; this.render_bs_statement(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	load_ratios() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method_ratios,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.ratios_data = r.message; this.render_ratios(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	load_trends() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method_trends,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.trends_data = r.message; this.render_trends(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	load_costs() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method_costs,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.costs_data = r.message; this.render_costs(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	load_pl_flow() {
		const company = this.company_control.get_value();
		const from_date = this.from_date_control.get_value();
		const to_date = this.to_date_control.get_value();
		const request_id = ++this.request_id;
		if (!company) { this.render_error('Please select a company'); return; }
		this.render_loading();
		frappe.call({
			method: this.method_pl_flow,
			args: { company: company, from_date: from_date, to_date: to_date },
			callback: (r) => {
				if (request_id !== this.request_id) return;
				if (!r.message) { this.render_error(); return; }
				try { this.pl_flow_data = r.message; this.render_pl_flow(); } catch (error) { this.render_error(error); }
			},
			error: (xhr) => { if (request_id !== this.request_id) return; this.render_error(); }
		});
	}

	render_loading() {
		const $target = $(this.page.body).find('.fo-shell').length ? this.ensure_shell() : $(this.page.body);
		$target.html(`
			<div class="fo-page fo-loading-state">
				<div class="fo-spinner"></div>
				<div class="fo-loading-text">${__('Loading financial data...')}</div>
			</div>
		`);
	}

	render_error(error) {
		const detail = error && error.message ? `<div class="fo-error-detail">${frappe.utils.escape_html(error.message)}</div>` : '';
		const $target = $(this.page.body).find('.fo-shell').length ? this.ensure_shell() : $(this.page.body);
		$target.html(`
			<div class="fo-page fo-loading-state">
				<div class="fo-loading-text">${__('Could not load financial data. Please check the server logs.')}</div>
				${detail}
			</div>
		`);
	}

	render_overview() {
		const d = this.data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_html(d));
		this.$tooltip = $(this.page.body).find('.fo-tooltip');
		this.render_donut(d.revenue_breakdown);
		this.render_trend_chart(d.trend);
		this.wire_bar_tooltips();
	}

	render_statement() {
		const d = this.statement_data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_statement_html(d));
		this.wire_statement_toggles();
	}

	render_bs_statement() {
		const d = this.bs_statement_data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_bs_statement_html(d));
		this.wire_statement_toggles();
	}

	render_ratios() {
		const d = this.ratios_data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_ratios_html(d));
		this.wire_statement_toggles();
	}

	render_pl_flow() {
		const d = this.pl_flow_data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_pl_flow_html(d));
		this.wire_pl_flow_toggles();

		// Load ECharts properly before rendering
		if (typeof echarts === 'undefined') {
			$('#fo-sankey-chart').html('<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">Loading Chart Library...</div>');

			frappe.require('https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', () => {
				this.render_sankey_chart();
				this.render_bridge_chart();
			}, (err) => {
				console.error("ECharts failed to load", err);
				$('#fo-sankey-chart').html('<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#d9534f;">Failed to load ECharts library. Please check your internet connection.</div>');
				this.render_bridge_chart();
			});
		} else {
			this.render_sankey_chart();
			this.render_bridge_chart();
		}
	}

	wire_statement_toggles() {
		$(this.page.body).find('.fo-toggle-btn').off('click.stmt').on('click.stmt', (e) => {
			const view = $(e.currentTarget).data('view');
			if (view === this.active_statement_view) return;
			this.active_statement_view = view;
			this.active_tab = 'statement';
			if (view === 'bs') { if (this.bs_statement_data) { this.render_bs_statement(); } else { this.load_bs_statement(); } }
			else if (view === 'ratios') { if (this.ratios_data) { this.render_ratios(); } else { this.load_ratios(); } }
			else { if (this.statement_data) { this.render_statement(); } else { this.load_statement(); } }
		});
		$(this.page.body).find('.fo-print-btn').off('click.print').on('click.print', () => this.print_current_view());
	}

	wire_pl_flow_toggles() {
		// Summary/Detailed Toggle for the main Sankey chart
		$(this.page.body).find('.fo-pl-flow-toggle .fo-toggle-btn').off('click.pl_flow_view').on('click.pl_flow_view', (e) => {
			const view = $(e.currentTarget).data('view');
			if (view === this.active_pl_flow_view) return;
			this.active_pl_flow_view = view;

			$(this.page.body).find('.fo-pl-flow-toggle .fo-toggle-btn').removeClass('fo-toggle-btn-active');
			$(e.currentTarget).addClass('fo-toggle-btn-active');

			this.render_sankey_chart();
		});

		// Bridge popup toggle button (top-right arrow)
		$(this.page.body).find('.fo-bridge-toggle-btn').off('click.bridge_popup').on('click.bridge_popup', () => {
			this.bridge_popup_open = !this.bridge_popup_open;
			this.toggle_bridge_popup();
		});

		// Close button inside popup
		$(this.page.body).find('.fo-bridge-popup-close').off('click.bridge_close').on('click.bridge_close', () => {
			this.bridge_popup_open = false;
			this.toggle_bridge_popup();
		});

		// EBIT / Net Income Toggle inside popup
		$(this.page.body).find('.fo-bridge-popup-toggle .fo-toggle-btn').off('click.bridge_view').on('click.bridge_view', (e) => {
			const bridge = $(e.currentTarget).data('bridge');
			if (bridge === this.active_bridge_view) return;
			this.active_bridge_view = bridge;

			$(this.page.body).find('.fo-bridge-popup-toggle .fo-toggle-btn').removeClass('fo-toggle-btn-active');
			$(e.currentTarget).addClass('fo-toggle-btn-active');

			this.render_bridge_chart();
		});
	}

	toggle_bridge_popup() {
		const $popup = $(this.page.body).find('.fo-bridge-popup');
		const $overlay = $(this.page.body).find('.fo-bridge-popup-overlay');
		const $btn = $(this.page.body).find('.fo-bridge-toggle-btn');

		if (this.bridge_popup_open) {
			$popup.addClass('fo-bridge-popup-open');
			$overlay.addClass('fo-bridge-popup-overlay-open');
			$btn.addClass('fo-bridge-toggle-btn-active');
			this.render_bridge_chart();
		} else {
			$popup.removeClass('fo-bridge-popup-open');
			$overlay.removeClass('fo-bridge-popup-overlay-open');
			$btn.removeClass('fo-bridge-toggle-btn-active');
		}
	}

	print_current_view() {
		const styles_el = document.getElementById('financial-overview-styles');
		const styles_html = styles_el ? styles_el.innerHTML : '';
		const $clone = $(this.page.body).find('.fo-page').first().clone();
		$clone.find('.fo-trends-toggle, .fo-print-btn, .fo-header-actions, .fo-tooltip').remove();
		$clone.find('.fo-toggle-btn').remove();
		const doc_html = `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>${__('Financial Statements')}</title>
	<style>
		${styles_html}
		body { background: #fff !important; padding: 15px; margin: 0; font-family: 'Inter', Arial, sans-serif; }
		.fo-page { padding: 0 !important; background: #fff !important; }
		.fo-statement-table { font-size: 11px !important; }
		.fo-statement-table th, .fo-statement-table td { padding: 6px 10px !important; }
		.fo-statement-summary-row { grid-template-columns: repeat(4, 1fr) !important; gap: 10px !important; }
		.fo-statement-card { padding: 10px !important; box-shadow: none !important; }
		.fo-header { margin-bottom: 10px !important; }
		.fo-title { font-size: 22px !important; }
		.fo-missing-panel { page-break-before: auto; }
		@page { margin: 1cm; }
		@media print { body { padding: 0; } }
	</style>
</head>
<body>${$clone[0].outerHTML}</body>
</html>`;
		const w = window.open('', '_blank');
		if (!w) { frappe.msgprint(__('Please allow popups to print.')); return; }
		w.document.open();
		w.document.write(doc_html);
		w.document.close();
		setTimeout(() => { try { w.focus(); w.print(); } catch (err) { console.error('Print failed', err); } }, 400);
	}

	get_statement_toggle_html() {
		const show_print = this.active_statement_view === 'pl' || this.active_statement_view === 'bs';
		return `
			<div class="fo-header-actions">
				<div class="fo-trends-toggle">
					<button type="button" class="fo-toggle-btn ${this.active_statement_view === 'pl' ? 'fo-toggle-btn-active' : ''}" data-view="pl">
						${this.icon('dollar-sign')} ${__('P&L Statement')}
					</button>
					<button type="button" class="fo-toggle-btn ${this.active_statement_view === 'bs' ? 'fo-toggle-btn-active' : ''}" data-view="bs">
						${this.icon('bar-chart-2')} ${__('Balance Sheet')}
					</button>
					<button type="button" class="fo-toggle-btn ${this.active_statement_view === 'ratios' ? 'fo-toggle-btn-active' : ''}" data-view="ratios">
						${this.icon('pie-chart')} ${__('Financial Ratios')}
					</button>
				</div>
				${show_print ? `
					<button type="button" class="fo-print-btn" title="${__('Print')}">
						${this.icon('printer')} ${__('Print')}
					</button>
				` : ''}
			</div>
		`;
	}

	get_missing_accounts_html(d) {
		if (!d.missing_accounts || !d.missing_accounts.length) { return ''; }
		const items_html = d.missing_accounts.map(a => `<li>${frappe.utils.escape_html(a.account_name)}</li>`).join('');
		return `
			<div class="fo-missing-panel">
				<div class="fo-panel-title">${__('Accounts Not Mapped to a PL Category')}</div>
				<div class="fo-missing-note">${__('These accounts qualify for the P&L (Account Type is not Group, Report Type is Profit and Loss) but have no PL Category set yet, so they are missing from the statement above.')}</div>
				<ul class="fo-missing-list">${items_html}</ul>
			</div>
		`;
	}

	get_statement_html(d) {
		const missing_accounts_html = this.get_missing_accounts_html(d);
		const toggle_html = this.get_statement_toggle_html();
		if (d.empty_message) {
			return `
				<div class="fo-page fo-statement-page">
					<div class="fo-header fo-trends-header">
						<div><h1 class="fo-title">Financial <span class="fo-title-accent">Statements</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year}</div></div>
						${toggle_html}
					</div>
					<div class="fo-statement-empty">${frappe.utils.escape_html(d.empty_message)}</div>
					${missing_accounts_html}
				</div>
			`;
		}
		const rows_html = (d.rows || []).map(row => this.get_statement_row_html(row)).join('');
		const summary_cards_html = (d.summary_cards || []).map(c => `
			<div class="fo-statement-card">
				<div class="fo-statement-card-top">
					<span class="fo-icon">${this.icon(c.icon)}</span>
					<span class="fo-badge ${c.change_pct_class}">${c.change_pct >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(c.change_pct)}%</span>
				</div>
				<div class="fo-statement-card-label">${c.label}</div>
				<div class="fo-statement-card-value">${c.value_fmt}</div>
				<div class="fo-statement-card-vs">vs. ${c.prior_value_fmt}</div>
			</div>
		`).join('');
		return `
			<div class="fo-page fo-statement-page">
				<div class="fo-header fo-trends-header">
					<div><h1 class="fo-title">Financial <span class="fo-title-accent">Statements</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year} Performance</div></div>
					${toggle_html}
				</div>
				<div class="fo-statement-summary-row">${summary_cards_html}</div>
				<div class="fo-statement-panel">
					<table class="fo-statement-table">
						<thead><tr><th class="fo-st-line">${__('Line Item')}</th><th>${d.fiscal_year}</th><th>${d.prior_fiscal_year || ''}</th><th>${__('Var $')}</th><th>${__('Var %')}</th></tr></thead>
						<tbody>${rows_html}</tbody>
					</table>
				</div>
				${missing_accounts_html}
			</div>
		`;
	}

	get_bs_statement_html(d) {
		const missing_accounts_html = this.get_missing_accounts_html(d);
		const toggle_html = this.get_statement_toggle_html();
		if (d.empty_message) {
			return `
				<div class="fo-page fo-statement-page">
					<div class="fo-header fo-trends-header">
						<div><h1 class="fo-title">Financial <span class="fo-title-accent">Statements</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year}</div></div>
						${toggle_html}
					</div>
					<div class="fo-statement-empty">${frappe.utils.escape_html(d.empty_message)}</div>
					${missing_accounts_html}
				</div>
			`;
		}
		const rows_html = (d.rows || []).map(row => this.get_statement_row_html(row)).join('');
		const summary_cards_html = (d.summary_cards || []).map(c => {
			const is_provisional = (c.label || '').toLowerCase().includes('provisional');
			const value_class = is_provisional && c.value_fmt && c.value_fmt.trim().startsWith('-')
				? 'fo-value-negative'
				: '';
			return `
				<div class="fo-statement-card">
					<div class="fo-statement-card-top">
						<span class="fo-icon">${this.icon(c.icon)}</span>
						<span class="fo-badge ${c.change_pct_class}">${c.change_pct >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(c.change_pct)}%</span>
					</div>
					<div class="fo-statement-card-label">${c.label}</div>
					<div class="fo-statement-card-value ${value_class}">${c.value_fmt}</div>
					<div class="fo-statement-card-vs">vs. ${c.prior_value_fmt}</div>
				</div>
			`;
		}).join('');
		return `
			<div class="fo-page fo-statement-page">
				<div class="fo-header fo-trends-header">
					<div><h1 class="fo-title">Financial <span class="fo-title-accent">Statements</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year} Balance Sheet</div></div>
					${toggle_html}
				</div>
				<div class="fo-statement-summary-row">${summary_cards_html}</div>
				<div class="fo-statement-panel">
					<table class="fo-statement-table">
						<thead><tr><th class="fo-st-line">${__('Line Item')}</th><th>${d.fiscal_year}</th><th>${d.prior_fiscal_year || ''}</th><th>${__('Change $')}</th><th>${__('Change %')}</th></tr></thead>
						<tbody>${rows_html}</tbody>
					</table>
				</div>
				${missing_accounts_html}
			</div>
		`;
	}

	get_ratios_html(d) {
		const blocks_html = (d.blocks || []).map(block => {
			const rows_html = block.rows.map(row => `
				<div class="fo-ratio-row">
					<div class="fo-ratio-label">${row.label}</div>
					<div class="fo-ratio-value-wrap">
						<span class="fo-ratio-value">${row.value_fmt}</span>
						<span class="fo-badge ${row.change_class}">${row.change_fmt}</span>
					</div>
				</div>
			`).join('');
			return `
				<div class="fo-ratio-block" style="border-top: 4px solid ${block.color};">
					<div class="fo-ratio-block-header">
						<span class="fo-ratio-block-icon" style="color:${block.color};">${this.icon(block.icon)}</span>
						<span class="fo-ratio-block-title">${block.title}</span>
					</div>
					<div class="fo-ratio-block-rows">${rows_html}</div>
				</div>
			`;
		}).join('');
		const toggle_html = this.get_statement_toggle_html();
		return `
			<div class="fo-page fo-statement-page">
				<div class="fo-header fo-trends-header">
					<div><h1 class="fo-title">Financial <span class="fo-title-accent">Statements</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year} Performance</div></div>
					${toggle_html}
				</div>
				<div class="fo-ratios-grid">${blocks_html}</div>
			</div>
		`;
	}

	get_pl_flow_html(d) {
		const is_detail = this.active_pl_flow_view === 'detail';
		const popup_open = this.bridge_popup_open ? 'fo-bridge-popup-open' : '';
		const overlay_open = this.bridge_popup_open ? 'fo-bridge-popup-overlay-open' : '';

		return `
			<div class="fo-page fo-pl-flow-page">
				<div class="fo-pl-flow-container">

					<!-- Main Chart Area -->
					<div class="fo-pl-flow-main">
						<div class="fo-pl-flow-header">
							<div>
								<h1 class="fo-title">P&L <span class="fo-title-accent">Flow</span></h1>
								<div class="fo-subtitle">${d.company} | ${d.fiscal_year} vs ${d.prior_fiscal_year || ''}</div>
							</div>
							<div class="fo-pl-flow-header-actions">
								<div class="fo-pl-flow-toggle fo-trends-toggle">
									<button type="button" class="fo-toggle-btn ${!is_detail ? 'fo-toggle-btn-active' : ''}" data-view="summary">
										${__('Summary')}
									</button>
									<button type="button" class="fo-toggle-btn ${is_detail ? 'fo-toggle-btn-active' : ''}" data-view="detail">
										${__('Detailed')}
									</button>
								</div>
								<button type="button" class="fo-bridge-toggle-btn ${this.bridge_popup_open ? 'fo-bridge-toggle-btn-active' : ''}" title="${__('Bridge Analysis')}">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="15 18 9 12 15 6"></polyline>
									</svg>
								</button>
							</div>
						</div>
						<div class="fo-pl-flow-chart-wrap">
							<div id="fo-sankey-chart" class="fo-sankey-chart"></div>
						</div>
					</div>

				</div>

				<!-- Bridge Popup Overlay -->
				<div class="fo-bridge-popup-overlay ${overlay_open}"></div>

				<!-- Bridge Popup -->
				<div class="fo-bridge-popup ${popup_open}">
					<div class="fo-bridge-popup-header">
						<span class="fo-bridge-popup-title">Bridge Analysis</span>
						<button type="button" class="fo-bridge-popup-close" title="${__('Close')}">×</button>
					</div>
					<div class="fo-bridge-popup-toggle fo-trends-toggle">
						<button type="button" class="fo-toggle-btn ${this.active_bridge_view === 'ebit' ? 'fo-toggle-btn-active' : ''}" data-bridge="ebit">
							EBIT Bridge
						</button>
						<button type="button" class="fo-toggle-btn ${this.active_bridge_view === 'net_income' ? 'fo-toggle-btn-active' : ''}" data-bridge="net_income">
							Net Income Bridge
						</button>
					</div>
					<div id="fo-bridge-chart-sidebar" class="fo-bridge-chart-sidebar"></div>
					<div class="fo-bridge-footer" id="fo-bridge-footer-sidebar"></div>
				</div>

			</div>
		`;
	}

	get_statement_row_html(row) {
		if (row.row_type === 'section_header') {
			return `<tr class="fo-st-section-row"><td colspan="5">${frappe.utils.escape_html(row.label)}</td></tr>`;
		}
		if (row.row_type === 'group_header') {
			return `<tr class="fo-st-group-row"><td colspan="5">${frappe.utils.escape_html(row.label)}</td></tr>`;
		}
		const row_class = row.row_type === 'total' ? 'fo-st-total-row' : row.row_type === 'calculated' ? 'fo-st-calc-row' : 'fo-st-line-row';
		const var_class = row.var_pct >= 0 ? 'fo-st-var-up' : 'fo-st-var-down';
		const arrow = row.var_pct >= 0 ? '&#9650;' : '&#9660;';

		const cy_class = row.is_negative ? 'fo-value-negative' : '';
		const py_is_negative = row.py_fmt && row.py_fmt.trim().startsWith('-');
		const py_class = py_is_negative ? 'fo-value-negative' : '';
		const var_is_negative = row.var_amt_fmt && row.var_amt_fmt.trim().startsWith('-');
		const var_amt_class = var_is_negative ? 'fo-value-negative' : '';

		return `
			<tr class="${row_class}">
				<td class="fo-st-line">${frappe.utils.escape_html(row.label)}</td>
				<td class="${cy_class}">${row.cy_fmt}</td>
				<td class="${py_class}">${row.py_fmt}</td>
				<td class="${var_amt_class}">${row.var_amt_fmt}</td>
				<td class="${var_class}">${arrow} ${Math.abs(row.var_pct)}%</td>
			</tr>
		`;
	}

	render_trends() {
		const d = this.trends_data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_trends_html(d));
		this.$tooltip = $(this.page.body).find('.fo-tooltip');
		this.render_quarterly_bars(d);
		this.render_margin_trend_chart(d);
		this.wire_trend_toggles();
	}

	wire_trend_toggles() {
		$(this.page.body).find('.fo-toggle-btn').off('click').on('click', (e) => {
			const view = $(e.currentTarget).data('view');
			if (view === this.active_trend_view) { return; }
			this.active_trend_view = view;
			this.active_tab = 'trends';
			if (view === 'costs') {
				if (this.costs_data) { this.render_costs(); } else { this.load_costs(); }
			} else {
				this.render_trends();
			}
		});
	}

	get_trends_html(d) {
		const margin_cards_html = d.margin_cards.map(c => `
			<div class="fo-margin-card" style="border-left: 4px solid ${c.color};">
				<div class="fo-margin-card-top">
					<span class="fo-margin-card-label">${c.label}</span>
					<span class="fo-margin-card-diff ${c.diff_pp >= 0 ? 'fo-badge-up' : 'fo-badge-down'}">${c.diff_pp >= 0 ? '+' : ''}${c.diff_pp}pp</span>
				</div>
				<div class="fo-margin-card-value" style="color:${c.color};">${c.value_pct}%</div>
				<div class="fo-margin-card-bar-track">
					<div class="fo-margin-card-bar-fill" style="width:${Math.min(Math.abs(c.value_pct), 100)}%; background:${c.color};"></div>
				</div>
			</div>
		`).join('');
		return `
			<div class="fo-page fo-trends-page">
				<div class="fo-header fo-trends-header">
					<div><h1 class="fo-title">Financial <span class="fo-title-accent">Trends</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year} vs ${d.prior_fiscal_year || ''}</div></div>
					<div class="fo-trends-toggle">
						<button type="button" class="fo-toggle-btn ${this.active_trend_view === 'revenue' ? 'fo-toggle-btn-active' : ''}" data-view="revenue">${this.icon('pie-chart')} ${__('Revenue & Margins')}</button>
						<button type="button" class="fo-toggle-btn ${this.active_trend_view === 'costs' ? 'fo-toggle-btn-active' : ''}" data-view="costs">${this.icon('bar-chart-2')} ${__('Costs & Comparison')}</button>
					</div>
				</div>
				<div class="fo-trends-layout">
					<div class="fo-panel">
						<div class="fo-panel-title">${__('Quarterly Revenue')}</div>
						<div class="fo-panel-subtitle">${__('By category breakdown')}</div>
						<div class="fo-chart-with-legend">
							<div class="fo-chart-area">
								<div id="fo-quarterly-bars" class="fo-quarterly-bars-wrap"></div>
							</div>
							<div id="fo-quarterly-legend" class="fo-chart-legend-vertical"></div>
						</div>
					</div>
					<div class="fo-panel">
						<div class="fo-panel-title">${__('Margin Trends')}</div>
						<div class="fo-panel-subtitle">${__('Quarterly profitability')}</div>
						<div class="fo-chart-with-legend">
							<div class="fo-chart-area">
								<div id="fo-margin-trend-chart" class="fo-margin-trend-chart-wrap"></div>
							</div>
							<div id="fo-margin-trend-legend" class="fo-chart-legend-vertical"></div>
						</div>
					</div>
				</div>
				<div class="fo-margin-cards-row">${margin_cards_html}</div>
				<div class="fo-tooltip"></div>
			</div>
		`;
	}

	render_quarterly_bars(d) {
		const bars = d.quarterly_bars;
		const max_val = d.max_val || 1;
		const colors = d.category_colors;
		const cat_labels = d.category_labels;
		const W = 800; const H = 340; const PAD_L = 60; const PAD_R = 20; const PAD_T = 20; const PAD_B = 50;
		const plot_w = W - PAD_L - PAD_R; const plot_h = H - PAD_T - PAD_B;
		const bar_group_w = plot_w / bars.length; const bar_w = bar_group_w * 0.55;
		const ticks = 5; let gridlines = '';
		for (let i = 0; i <= ticks; i++) {
			const v = (max_val / ticks) * i; const y = PAD_T + plot_h - (v / max_val) * plot_h;
			gridlines += `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#ececec" stroke-width="1" stroke-dasharray="3,4" /><text x="${PAD_L - 10}" y="${y + 4}" text-anchor="end" class="fo-axis-label">${d.currency_symbol}${v.toFixed(0)}M</text>`;
		}
		let bars_svg = '';
		bars.forEach((q, qi) => {
			const group_x = PAD_L + bar_group_w * qi + (bar_group_w - bar_w) / 2;
			let stack_y = PAD_T + plot_h;
			q.categories.forEach((cat) => {
				const val = cat.cy; if (val <= 0) return;
				const h = (val / max_val) * plot_h; stack_y -= h;
				const color = colors[cat.label] || '#002741';
				bars_svg += `<rect x="${group_x}" y="${stack_y}" width="${bar_w}" height="${h}" fill="${color}" class="fo-bar-segment" data-quarter="${q.label}" data-category="${cat.label}" data-value="${val}" data-total="${q.cy_total}" data-change="${q.change_pct}" />`;
			});
			const cx = PAD_L + bar_group_w * qi + bar_group_w / 2;
			bars_svg += `<text x="${cx}" y="${H - 20}" text-anchor="middle" class="fo-axis-label">${q.label}</text>`;
		});
		const svg = `<svg viewBox="0 0 ${W} ${H}" class="fo-quarterly-svg" preserveAspectRatio="none">${gridlines}${bars_svg}</svg>`;
		$('#fo-quarterly-bars').html(svg);

		// Right-side vertical legend
		const legend_html = cat_labels.map(label => `
			<div class="fo-chart-legend-item">
				<span class="fo-chart-legend-swatch" style="background:${colors[label] || '#002741'}"></span>
				<span>${label}</span>
			</div>
		`).join('');
		$('#fo-quarterly-legend').html(legend_html);

		const page_offset = $(this.page.body).find('.fo-page').offset();
		$(this.page.body).find('.fo-bar-segment').off('mouseenter.tip mouseleave.tip').on('mouseenter.tip', (e) => {
			const $el = $(e.currentTarget); const quarter = $el.data('quarter'); const total = parseFloat($el.data('total'));
			const q_data = bars.find(b => b.label === quarter);
			const breakdown = (q_data.categories || []).filter(c => c.cy > 0).map(c => `
				<div class="fo-trend-tip-row"><span class="fo-dot" style="background:${colors[c.label] || '#002741'}"></span>${c.label}<b>${d.currency_symbol}${c.cy.toFixed(1)}M</b></div>
			`).join('');
			const html = `<div class="fo-trend-tip-header">${quarter} · ${d.fiscal_year}</div>${breakdown}<div class="fo-trend-tip-yoy"><span>${__('Total')}</span><span style="margin-left:auto;"><b>${d.currency_symbol}${total.toFixed(1)}M</b></span></div>`;
			const rect = e.currentTarget.getBoundingClientRect();
			const x = rect.left + window.scrollX - page_offset.left + rect.width / 2;
			const y = rect.top + window.scrollY - page_offset.top - 10;
			this.show_tooltip(html, x, y, 'fo-tooltip-trend');
		}).on('mouseleave.tip', () => this.hide_tooltip());
	}

	render_margin_trend_chart(d) {
		const data = d.margin_trends;
		if (!data || !data.length) { $('#fo-margin-trend-chart').html('<div class="fo-statement-empty">No margin data</div>'); return; }
		const W = 800; const H = 300; const PAD_L = 50; const PAD_R = 20; const PAD_T = 20; const PAD_B = 40;
		const plot_w = W - PAD_L - PAD_R; const plot_h = H - PAD_T - PAD_B;
		const all_vals = []; data.forEach(q => { all_vals.push(q.gross_margin, q.operating_margin, q.net_margin, q.ebitda_margin); });
		const max_m = Math.max(...all_vals, 10); const y_max = Math.ceil(max_m / 10) * 10;
		let grid = '';
		for (let i = 0; i <= 4; i++) { const v = (y_max / 4) * i; const y = PAD_T + plot_h - (v / y_max) * plot_h; grid += `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#ececec" stroke-width="1" stroke-dasharray="3,4" /><text x="${PAD_L - 10}" y="${y + 4}" text-anchor="end" class="fo-axis-label">${v.toFixed(0)}%</text>`; }
		const group_w = plot_w / data.length; const bar_w = group_w * 0.15; const gap = group_w * 0.03;
		const metrics = [
			{ key: 'net_margin', color: '#edd6c8', label: 'Net Margin' },
			{ key: 'operating_margin', color: '#9b153e', label: 'Operating Margin' },
			{ key: 'ebitda_margin', color: '#333333', label: 'EBITDA Margin' },
			{ key: 'gross_margin', color: '#002741', label: 'Gross Margin' },
		];
		let bars = '';
		data.forEach((q, qi) => {
			const group_x = PAD_L + group_w * qi + (group_w - (bar_w * 4 + gap * 3)) / 2;
			metrics.forEach((m, mi) => {
				const val = q[m.key] || 0; const h = (val / y_max) * plot_h;
				const x = group_x + mi * (bar_w + gap); const y = PAD_T + plot_h - h;
				bars += `<rect x="${x}" y="${y}" width="${bar_w}" height="${Math.max(h, 1)}" fill="${m.color}" rx="2" class="fo-margin-bar" data-quarter="${q.label}" data-metric="${m.label}" data-value="${val}" data-color="${m.color}" />`;
			});
			const cx = PAD_L + group_w * qi + group_w / 2;
			bars += `<text x="${cx}" y="${H - 15}" text-anchor="middle" class="fo-axis-label">${q.label}</text>`;
		});
		const svg = `<svg viewBox="0 0 ${W} ${H}" class="fo-margin-trend-svg" preserveAspectRatio="none">${grid}${bars}</svg>`;
		$('#fo-margin-trend-chart').html(svg);

		// Right-side vertical legend
		const legend_html = metrics.map(m => `
			<div class="fo-chart-legend-item">
				<span class="fo-chart-legend-swatch" style="background:${m.color}"></span>
				<span>${m.label}</span>
			</div>
		`).join('');
		$('#fo-margin-trend-legend').html(legend_html);

		const page_offset = $(this.page.body).find('.fo-page').offset();
		$(this.page.body).find('.fo-margin-bar').off('mouseenter.tip mouseleave.tip').on('mouseenter.tip', (e) => {
			const $el = $(e.currentTarget); const quarter = $el.data('quarter'); const metric = $el.data('metric'); const val = parseFloat($el.data('value')); const color = $el.data('color');
			const html = `<div class="fo-trend-tip-header">${quarter} · ${d.fiscal_year}</div><div class="fo-trend-tip-row"><span class="fo-dot" style="background:${color}"></span>${metric}<b>${val.toFixed(1)}%</b></div>`;
			const rect = e.currentTarget.getBoundingClientRect();
			const x = rect.left + window.scrollX - page_offset.left + rect.width / 2;
			const y = rect.top + window.scrollY - page_offset.top - 10;
			this.show_tooltip(html, x, y, 'fo-tooltip-trend');
		}).on('mouseleave.tip', () => this.hide_tooltip());
	}

	render_costs() {
		const d = this.costs_data;
		const $content = this.ensure_shell();
		$content.empty();
		$content.append(this.get_costs_html(d));
		this.$tooltip = $(this.page.body).find('.fo-tooltip');
		this.wire_trend_toggles();
	}

	get_costs_html(d) {
		const left_html = d.left_cards.map(c => {
			const spark_cy = this.build_spark_path(c.sparkline_cy, 220, 40);
			const spark_py = this.build_spark_path(c.sparkline_py, 220, 40);
			return `
				<div class="fo-cost-left-card">
					<div class="fo-cost-left-top">
						<span class="fo-cost-left-label">${c.label}</span>
						<span class="fo-badge ${c.change_pct >= 0 ? 'fo-badge-up' : 'fo-badge-down'}">${c.change_pct >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(c.change_pct)}%</span>
					</div>
					<div class="fo-cost-left-value">${c.value_fmt}</div>
					<svg viewBox="0 0 220 40" class="fo-cost-spark" preserveAspectRatio="none">
						<path d="${spark_py}" fill="none" stroke="#cfcfcf" stroke-width="1.5" />
						<path d="${spark_cy}" fill="none" stroke="${c.color}" stroke-width="2" />
					</svg>
				</div>
			`;
		}).join('');
		const opex_rows_html = d.opex_rows.map(r => `
			<div class="fo-opex-row">
				<div class="fo-opex-row-top">
					<span class="fo-opex-row-label">${r.label}</span>
					<span class="fo-opex-row-value">${r.cy_abs_fmt}<span class="fo-opex-row-change ${r.change_pct >= 0 ? 'fo-st-var-down' : 'fo-st-var-up'}">${r.change_pct >= 0 ? '+' : ''}${r.change_pct}%</span></span>
				</div>
				<div class="fo-opex-row-track"><div class="fo-opex-row-fill" style="width:${r.bar_pct}%; background:${r.color};"></div></div>
			</div>
		`).join('');
		const bottom_html = d.bottom_cards.map(b => `
			<div class="fo-cost-bottom-card">
				<div class="fo-cost-bottom-label">${b.label}</div>
				<div class="fo-cost-bottom-value">${b.value_fmt}</div>
				<div class="fo-cost-bottom-prior">vs ${b.prior_value_fmt} <span class="${b.change_pct >= 0 ? 'fo-st-var-up' : 'fo-st-var-down'}">${b.change_pct >= 0 ? '+' : ''}${b.change_pct}%</span></div>
			</div>
		`).join('');
		return `
			<div class="fo-page fo-costs-page">
				<div class="fo-header fo-trends-header">
					<div><h1 class="fo-title">Financial <span class="fo-title-accent">Trends</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year} vs ${d.prior_fiscal_year || ''}</div></div>
					<div class="fo-trends-toggle">
						<button type="button" class="fo-toggle-btn ${this.active_trend_view === 'revenue' ? 'fo-toggle-btn-active' : ''}" data-view="revenue">${this.icon('pie-chart')} ${__('Revenue & Margins')}</button>
						<button type="button" class="fo-toggle-btn ${this.active_trend_view === 'costs' ? 'fo-toggle-btn-active' : ''}" data-view="costs">${this.icon('bar-chart-2')} ${__('Costs & Comparison')}</button>
					</div>
				</div>
				<div class="fo-costs-layout">
					<div class="fo-costs-left">${left_html}</div>
					<div class="fo-costs-right">
						<div class="fo-panel">
							<div class="fo-panel-title-row">
								<div><div class="fo-panel-title">${__('Operating Expenses')}</div><div class="fo-panel-subtitle">${__('Year-over-year comparison')}</div></div>
								<div class="fo-opex-total">Total: <b>${d.opex_total_cy_fmt}</b><span class="fo-badge ${d.opex_total_change_pct >= 0 ? 'fo-badge-down' : 'fo-badge-up'}">${d.opex_total_change_pct >= 0 ? '+' : ''}${d.opex_total_change_pct}%</span></div>
							</div>
							<div class="fo-opex-list">${opex_rows_html}</div>
						</div>
					</div>
				</div>
				<div class="fo-costs-bottom-row">${bottom_html}</div>
				<div class="fo-tooltip"></div>
			</div>
		`;
	}

	build_spark_path(values, w, h) {
		if (!values || values.length < 2) { return `M0,${h / 2} L${w},${h / 2}`; }
		const min = Math.min(...values); const max = Math.max(...values); const range = (max - min) || 1;
		return values.map((v, i) => {
			const x = (w * i) / (values.length - 1); const y = h - ((v - min) / range) * h;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	icon(name) {
		const icons = {
			'dollar-sign': '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
			'bar-chart-2': '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
			'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
			'pie-chart': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>',
			'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
			'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
			'printer': '<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect>'
		};
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
	}

	get_html(d) {
		const stat_cards_html = d.stat_cards.map(c => `
			<div class="fo-card">
				<div class="fo-card-top">
					<span class="fo-icon">${this.icon(c.icon)}</span>
					<span class="fo-badge ${c.change_pct >= 0 ? 'fo-badge-up' : 'fo-badge-down'}">${c.change_pct >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(c.change_pct)}%</span>
				</div>
				<div class="fo-card-label">${c.label}</div>
				<div class="fo-card-value">${c.value_fmt}</div>
				<div class="fo-card-vs">vs. ${c.prior_value_fmt}</div>
				<div class="fo-bars" data-card="${c.key}">
					${c.quarters.map((q, i) => `
						<div class="fo-bar-col" data-quarter="${q.label}" data-change="${q.change_pct}">
							<div class="fo-bar ${q.is_down ? 'fo-bar-orange' : ''}" style="height:${q.bar_pct}%"></div>
							<div class="fo-bar-label">${q.label}</div>
						</div>
					`).join('')}
				</div>
			</div>
		`).join('');
		const legend_html = d.revenue_breakdown.map((r, i) => `
			<div class="fo-legend-row" data-slice="${i}">
				<span class="fo-dot" style="background:${r.color}"></span>
				<div>
					<div class="fo-legend-label">${r.label}</div>
					<div class="fo-legend-value">${r.value_fmt}<span class="fo-legend-pct">(${r.pct}%)</span></div>
				</div>
			</div>
		`).join('');
		return `
			<div class="fo-page">
				<div class="fo-header">
					<div><h1 class="fo-title">Financial <span class="fo-title-accent">Overview</span></h1><div class="fo-subtitle">${d.company} | ${d.fiscal_year} Performance</div></div>
					<div class="fo-note">${__('Live data from your accounting records.')}</div>
				</div>
				<div class="fo-stats-row">
					<div class="fo-hero-card">
						<div class="fo-hero-top">
							<span class="fo-hero-label">${this.icon('camera')} ${__('Total Revenue')}</span>
							<span class="fo-badge fo-badge-hero">${d.total_revenue.change_pct >= 0 ? '&#8599;' : '&#8600;'} ${Math.abs(d.total_revenue.change_pct)}%</span>
						</div>
						<div class="fo-hero-value">${d.total_revenue.value_fmt}</div>
						<div class="fo-hero-divider"></div>
						<div class="fo-hero-metrics">
							<div><div class="fo-hero-metric-label">${__('vs')} ${d.prior_fiscal_year || ''}</div><span class="fo-hero-metric-badge">${d.total_revenue.vs_amount_fmt}</span></div>
							<div><div class="fo-hero-metric-label">${__('Gross Margin')}</div><div class="fo-hero-metric-value">${d.total_revenue.gross_margin}%</div></div>
							<div><div class="fo-hero-metric-label">${__('Net Margin')}</div><div class="fo-hero-metric-value">${d.total_revenue.net_margin}%</div></div>
						</div>
						<div class="fo-hero-legend">
							<span><i class="fo-line-swatch fo-line-2025"></i>${d.fiscal_year}</span>
							<span><i class="fo-line-swatch fo-line-2024"></i>${d.prior_fiscal_year || ''}</span>
						</div>
						<svg class="fo-hero-spark" viewBox="0 0 300 60" preserveAspectRatio="none"><path d="${this.get_spark_path(d.trend)}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" /></svg>
					</div>
					<div class="fo-stats-grid">${stat_cards_html}</div>
				</div>
				<div class="fo-panels-row">
					<div class="fo-panel fo-panel-breakdown">
						<div class="fo-panel-title">${__('Revenue Breakdown')}</div>
						<div class="fo-breakdown-body">
							<div class="fo-legend">${legend_html}</div>
							<div class="fo-donut-wrap">
								<svg class="fo-donut-svg" id="fo-donut-svg" viewBox="0 0 200 200"></svg>
								<div class="fo-donut-center">
									<div class="fo-donut-total-label">${__('Total')}</div>
									<div class="fo-donut-total-value">${d.revenue_total_fmt}</div>
								</div>
							</div>
						</div>
					</div>
					<div class="fo-panel fo-panel-trend">
						<div class="fo-panel-title">${__('Revenue Trend')}</div>
						<div id="fo-trend-chart" class="fo-trend-chart-wrap"></div>
					</div>
				</div>
				<div class="fo-tooltip"></div>
			</div>
		`;
	}

	get_spark_path(trend) {
		if (!trend || !trend.current || !trend.current.length) { return 'M0,30 L300,30'; }
		const vals = trend.current.map(c => c.value);
		const min = Math.min(...vals); const max = Math.max(...vals) || 1;
		const w = 300; const h = 60;
		return vals.map((v, i) => {
			const x = (w * i) / (vals.length - 1); const y = h - ((v - min) / (max - min || 1)) * h;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	show_tooltip(html, x, y, extra_class) {
		this.$tooltip.attr('class', 'fo-tooltip fo-tooltip-visible ' + (extra_class || '')).html(html).css({ left: x + 'px', top: y + 'px' });
	}

	hide_tooltip() {
		if (this.$tooltip) { this.$tooltip.removeClass('fo-tooltip-visible'); }
	}

	wire_bar_tooltips() {
		const $page = $(this.page.body).find('.fo-page'); const page_offset = $page.offset();
		$page.find('.fo-bar-col').on('mouseenter', (e) => {
			const $col = $(e.currentTarget); const q = $col.data('quarter'); const change = parseFloat($col.data('change'));
			const sign = change >= 0 ? '+' : ''; const pos = $col.find('.fo-bar')[0].getBoundingClientRect();
			const x = pos.left + window.scrollX - page_offset.left + pos.width / 2;
			const y = pos.top + window.scrollY - page_offset.top - 8;
			this.show_tooltip(`<b>${q}:</b> ${sign}${change}%`, x, y, 'fo-tooltip-bar');
		}).on('mouseleave', () => this.hide_tooltip());
	}

	render_donut(breakdown) {
		const $svg = $('#fo-donut-svg');
		const cx = 100; const cy = 100; const r_outer = 100; const r_inner = 66;
		let acc = 0; const paths = [];
		breakdown.forEach((seg, i) => {
			const start_angle = (acc / 100) * 360; acc += seg.pct; const end_angle = (acc / 100) * 360;
			const d = this.donut_arc_path(cx, cy, r_outer, r_inner, start_angle, end_angle);
			paths.push(`<path d="${d}" fill="${seg.color}" data-slice="${i}" class="fo-donut-slice"></path>`);
		});
		$svg.html(paths.join(''));
		const page_offset = $(this.page.body).find('.fo-page').offset();
		const highlight = (i) => {
			$svg.find('.fo-donut-slice').removeClass('fo-donut-slice-dim');
			$svg.find(`.fo-donut-slice[data-slice="${i}"]`).addClass('fo-donut-slice-active');
			$svg.find('.fo-donut-slice').not(`[data-slice="${i}"]`).addClass('fo-donut-slice-dim');
		};
		const unhighlight = () => { $svg.find('.fo-donut-slice').removeClass('fo-donut-slice-dim fo-donut-slice-active'); };
		const show_breakdown = (i, target_rect) => {
			const seg = breakdown[i];
			const sub_html = (seg.sub_items || []).map(s => `
				<div class="fo-popup-sub-row">
					<div class="fo-popup-sub-top"><span>${s.label}</span><span class="fo-popup-sub-value">${s.value_fmt}</span></div>
					<div class="fo-popup-sub-track"><div class="fo-popup-sub-fill" style="width:${s.bar_pct}%; background:${seg.color}"></div></div>
				</div>
			`).join('');
			const html = `
				<div class="fo-popup-header"><span class="fo-dot" style="background:${seg.color}"></span><b>${seg.label}</b></div>
				<div class="fo-popup-total-row"><span class="fo-popup-total-value">${seg.value_fmt}</span><span class="fo-popup-total-pct">${seg.pct}%</span></div>
				<div class="fo-popup-sub-heading">${__('BREAKDOWN')}</div>
				${sub_html || `<div class="fo-popup-sub-empty">${__('No item-level data')}</div>`}
			`;
			const x = target_rect.left + window.scrollX - page_offset.left + target_rect.width + 12;
			const y = target_rect.top + window.scrollY - page_offset.top;
			this.show_tooltip(html, x, y, 'fo-tooltip-donut');
		};
		$svg.find('.fo-donut-slice').on('mouseenter', (e) => {
			const i = $(e.currentTarget).data('slice'); highlight(i);
			const rect = $('.fo-donut-wrap')[0].getBoundingClientRect(); show_breakdown(i, rect);
		}).on('mouseleave', () => { unhighlight(); this.hide_tooltip(); });
		$(this.page.body).find('.fo-legend-row').on('mouseenter', (e) => {
			const i = $(e.currentTarget).data('slice'); highlight(i);
			const rect = $('.fo-donut-wrap')[0].getBoundingClientRect(); show_breakdown(i, rect);
		}).on('mouseleave', () => { unhighlight(); this.hide_tooltip(); });
	}

	donut_arc_path(cx, cy, r_outer, r_inner, start_angle, end_angle) {
		const gap = 1.2; start_angle += gap; end_angle -= gap;
		if (end_angle < start_angle) { end_angle = start_angle; }
		const to_xy = (angle, r) => { const rad = ((angle - 90) * Math.PI) / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
		const large_arc = end_angle - start_angle > 180 ? 1 : 0;
		const [x1, y1] = to_xy(start_angle, r_outer); const [x2, y2] = to_xy(end_angle, r_outer);
		const [x3, y3] = to_xy(end_angle, r_inner); const [x4, y4] = to_xy(start_angle, r_inner);
		return [`M ${x1} ${y1}`, `A ${r_outer} ${r_outer} 0 ${large_arc} 1 ${x2} ${y2}`, `L ${x3} ${y3}`, `A ${r_inner} ${r_inner} 0 ${large_arc} 0 ${x4} ${y4}`, 'Z'].join(' ');
	}

	render_trend_chart(trend) {
		const W = 1000; const H = 380; const PAD_L = 50; const PAD_R = 20; const PAD_T = 20; const PAD_B = 30;
		const plot_w = W - PAD_L - PAD_R; const plot_h = H - PAD_T - PAD_B;
		const points = trend.current; const y_min = trend.y_min; const y_max = trend.y_max;
		const currency_symbol = (this.data && this.data.currency_symbol) || 'QAR';
		const x = i => PAD_L + (plot_w * i) / (points.length - 1);
		const y = v => PAD_T + plot_h - ((v - y_min) / (y_max - y_min || 1)) * plot_h;
		const to_path = key => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
		const path_current = to_path('value'); const path_prior = to_path('prior');
		const area_current = `${path_current} L${x(points.length - 1).toFixed(1)},${(PAD_T + plot_h).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + plot_h).toFixed(1)} Z`;
		const grid_vals = []; const steps = 4;
		for (let i = 0; i <= steps; i++) { grid_vals.push(y_min + ((y_max - y_min) * i) / steps); }
		const gridlines = grid_vals.map(v => `
			<line x1="${PAD_L}" y1="${y(v).toFixed(1)}" x2="${W - PAD_R}" y2="${y(v).toFixed(1)}" stroke="#e3e3e3" stroke-width="1" stroke-dasharray="3,4" />
			<text x="${PAD_L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="fo-axis-label">${currency_symbol}${v.toFixed(1)}M</text>
		`).join('');
		const x_labels = points.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="fo-axis-label" id="fo-month-label-${i}">${p.month}</text>`).join('');
		const svg = `
			<svg viewBox="0 0 ${W} ${H}" class="fo-trend-svg" id="fo-trend-svg">
				<defs><linearGradient id="fo-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#002741" stop-opacity="0.28" /><stop offset="100%" stop-color="#002741" stop-opacity="0" /></linearGradient></defs>
				${gridlines} ${x_labels}
				<path d="${area_current}" fill="url(#fo-area-fill)" stroke="none" />
				<path d="${path_prior}" fill="none" stroke="#edd6c8" stroke-width="2.5" />
				<path d="${path_current}" fill="none" stroke="#002741" stroke-width="2.5" />
				<line id="fo-crosshair" x1="0" y1="${PAD_T}" x2="0" y2="${PAD_T + plot_h}" stroke="#002741" stroke-width="1" stroke-dasharray="3,4" style="display:none" />
				<circle id="fo-dot-current" r="4.5" fill="#002741" stroke="#fff" stroke-width="2" style="display:none" />
				<circle id="fo-dot-prior" r="4.5" fill="#fff" stroke="#edd6c8" stroke-width="2" style="display:none" />
				<rect x="${PAD_L}" y="${PAD_T}" width="${plot_w}" height="${plot_h}" fill="transparent" id="fo-trend-overlay" />
			</svg>
			<div class="fo-trend-legend">
				<span><i class="fo-line-swatch" style="background:#002741"></i>${this.data.fiscal_year}</span>
				<span><i class="fo-line-swatch" style="background:#edd6c8"></i>${this.data.prior_fiscal_year || ''}</span>
			</div>
		`;
		$('#fo-trend-chart').html(svg);
		const $svg_el = $('#fo-trend-svg')[0]; const $overlay = $('#fo-trend-overlay');
		const page_offset = $(this.page.body).find('.fo-page').offset();
		$overlay.on('mousemove', (e) => {
			const pt = $svg_el.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
			const svg_p = pt.matrixTransform($svg_el.getScreenCTM().inverse());
			let idx = Math.round(((svg_p.x - PAD_L) / plot_w) * (points.length - 1));
			idx = Math.max(0, Math.min(points.length - 1, idx));
			const p = points[idx]; const cx = x(idx); const cy_val = y(p.value); const py_val = y(p.prior);
			$('#fo-crosshair').attr({ x1: cx, x2: cx }).show();
			$('#fo-dot-current').attr({ cx: cx, cy: cy_val }).show();
			$('#fo-dot-prior').attr({ cx: cx, cy: py_val }).show();
			$('.fo-axis-label[id^="fo-month-label-"]').removeClass('fo-axis-label-active');
			$(`#fo-month-label-${idx}`).addClass('fo-axis-label-active');
			const sign = p.change_pct >= 0 ? '+' : '';
			const html = `
				<div class="fo-trend-tip-header">${this.icon('calendar')} ${p.month} ${this.data.fiscal_year}</div>
				<div class="fo-trend-tip-row"><span class="fo-dot" style="background:#002741"></span>${__('Current Year')}<b>${currency_symbol}${p.value.toFixed(1)}M</b></div>
				<div class="fo-trend-tip-row"><span class="fo-dot fo-dot-hollow" style="border-color:#edd6c8"></span>${__('Prior Year')}<b>${currency_symbol}${p.prior.toFixed(1)}M</b></div>
				<div class="fo-trend-tip-yoy"><span class="${p.change_pct >= 0 ? 'fo-yoy-up' : 'fo-yoy-down'}">${p.change_pct >= 0 ? '&#8599;' : '&#8600;'} ${sign}${p.change_pct}%</span><span class="fo-trend-tip-amount">(${p.change_amount_fmt})</span></div>
			`;
			const svg_rect = $svg_el.getBoundingClientRect(); const scale_x = svg_rect.width / W; const scale_y = svg_rect.height / H;
			const screen_x = svg_rect.left + window.scrollX + cx * scale_x - page_offset.left;
			const screen_y = svg_rect.top + window.scrollY + cy_val * scale_y - page_offset.top;
			this.show_tooltip(html, screen_x, screen_y - 10, 'fo-tooltip-trend');
		}).on('mouseleave', () => {
			$('#fo-crosshair, #fo-dot-current, #fo-dot-prior').hide();
			$('.fo-axis-label[id^="fo-month-label-"]').removeClass('fo-axis-label-active');
			this.hide_tooltip();
		});
	}

	render_bridge_chart() {
		const container = document.getElementById('fo-bridge-chart-sidebar');
		if (!container) return;
		const d = this.pl_flow_data;
		if (!d) return;

		const bridgeData = this.active_bridge_view === 'ebit' ? d.ebit_bridge : d.net_income_bridge;

		const width = 350;
		const height = 400;
		const padding = { top: 40, right: 20, bottom: 60, left: 50 };
		const chartW = width - padding.left - padding.right;
		const chartH = height - padding.top - padding.bottom;

		let allValues = [bridgeData.start.value, bridgeData.end.value];
		let current = bridgeData.start.value;
		bridgeData.deltas.forEach(d => { current += d.value; allValues.push(current); });
		const minVal = Math.min(...allValues, 0);
		const maxVal = Math.max(...allValues, 0);
		const range = maxVal - minVal || 1;

		const yScale = val => padding.top + chartH - ((val - minVal) / range) * chartH;
		const xScale = idx => padding.left + (idx * (chartW / (bridgeData.deltas.length + 1))) + (chartW / (bridgeData.deltas.length + 1)) / 2;

		let svg = `<svg viewBox="0 0 ${width} ${height}" class="fo-bridge-svg">`;

		const ticks = 4;
		for (let i = 0; i <= ticks; i++) {
			const v = minVal + (range / ticks) * i;
			const y = yScale(v);
			svg += `
				<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e3e3e3" stroke-width="1" stroke-dasharray="3,4" />
				<text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" class="fo-axis-label" style="font-size: 10px;">${d.currency_symbol}${v.toFixed(1)}M</text>
			`;
		}

		const zeroY = yScale(0);
		svg += `<line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" stroke="#333" stroke-width="1.5" />`;

		let prevVal = bridgeData.start.value;
		let prevY = yScale(prevVal);
		let prevX = xScale(0);

		const startY = yScale(bridgeData.start.value);
		const startH = Math.abs(zeroY - startY);
		svg += `
			<rect x="${xScale(0) - 15}" y="${bridgeData.start.value >= 0 ? startY : zeroY}" width="30" height="${startH}" fill="#002741" rx="3" />
			<text x="${xScale(0)}" y="${startY - 8}" text-anchor="middle" class="fo-bridge-bar-label" style="font-size: 11px;">${d.currency_symbol}${bridgeData.start.value.toFixed(1)}M</text>
			<text x="${xScale(0)}" y="${height - 10}" text-anchor="middle" class="fo-axis-label" style="font-size: 10px; font-weight: 700;">${bridgeData.start.label}</text>
		`;
		prevVal = bridgeData.start.value;

		bridgeData.deltas.forEach((delta, i) => {
			const x = xScale(i + 1);
			const yStart = yScale(prevVal);
			const yEnd = yScale(prevVal + delta.value);
			const barY = Math.min(yStart, yEnd);
			const barH = Math.abs(yEnd - yStart);
			const isPositive = delta.value >= 0;

			svg += `
				<rect x="${x - 15}" y="${barY}" width="30" height="${Math.max(barH, 2)}" fill="${isPositive ? '#002741' : '#9b153e'}" rx="3" />
				<text x="${x}" y="${barY - 8}" text-anchor="middle" class="fo-bridge-bar-label ${isPositive ? 'fo-value-up' : 'fo-value-down'}" style="font-size: 11px;">
					${isPositive ? '+' : ''}${d.currency_symbol}${Math.abs(delta.value).toFixed(1)}M
				</text>
				<text x="${x}" y="${height - 10}" text-anchor="middle" class="fo-axis-label" style="font-size: 10px; font-weight: 700;">${delta.label}</text>
			`;

			svg += `<line x1="${prevX + 15}" y1="${prevY}" x2="${x - 15}" y2="${yStart}" stroke="#333" stroke-width="1.5" stroke-dasharray="3,3" />`;

			const badgeY = Math.min(yStart, yEnd) - 22;
			svg += `
				<rect x="${x - 20}" y="${badgeY}" width="40" height="14" rx="7" fill="${isPositive ? '#eaf7ef' : '#fdece3'}" />
				<text x="${x}" y="${badgeY + 10}" text-anchor="middle" class="fo-bridge-badge-text ${isPositive ? 'fo-value-up' : 'fo-value-down'}" style="font-size: 9px;">
					${isPositive ? '↑ UP' : '↓ DOWN'}
				</text>
			`;

			prevVal = prevVal + delta.value;
			prevY = yEnd;
			prevX = x;
		});

		const endX = xScale(bridgeData.deltas.length + 1);
		const endY = yScale(bridgeData.end.value);
		const endH = Math.abs(zeroY - endY);
		svg += `
			<line x1="${prevX + 15}" y1="${prevY}" x2="${endX - 15}" y2="${endY}" stroke="#333" stroke-width="1.5" stroke-dasharray="3,3" />
			<rect x="${endX - 15}" y="${bridgeData.end.value >= 0 ? endY : zeroY}" width="30" height="${endH}" fill="#002741" rx="3" />
			<text x="${endX}" y="${endY - 8}" text-anchor="middle" class="fo-bridge-bar-label" style="font-size: 11px;">${d.currency_symbol}${bridgeData.end.value.toFixed(1)}M</text>
			<text x="${endX}" y="${height - 10}" text-anchor="middle" class="fo-axis-label" style="font-size: 10px; font-weight: 700;">${bridgeData.end.label}</text>
		`;

		svg += `</svg>`;
		container.innerHTML = svg;

		const footer = document.getElementById('fo-bridge-footer-sidebar');
		if (footer) {
			const changeVal = bridgeData.end.value - bridgeData.start.value;
			const changePct = bridgeData.change_pct;
			const margin = bridgeData.margin_pct;
			const isUp = changePct >= 0;

			footer.innerHTML = `
				<div class="fo-bridge-footer-item">
					<span class="fo-bridge-footer-label">${this.active_bridge_view === 'ebit' ? 'EBIT' : 'NET INCOME'} CHANGE</span>
					<span class="fo-bridge-footer-value ${isUp ? 'fo-value-up' : 'fo-value-down'}">
						${d.currency_symbol}${Math.abs(changeVal).toFixed(0)}K
						${isUp ? '↑' : '↓'} ${Math.abs(changePct)}%
					</span>
				</div>
				<div class="fo-bridge-footer-item">
					<span class="fo-bridge-footer-label">MARGIN</span>
					<span class="fo-bridge-footer-value">
						${margin}%
					</span>
				</div>
			`;
		}
	}

	render_sankey_chart() {
		const container = document.getElementById('fo-sankey-chart');
		if (!container) return;

		const d = this.pl_flow_data;
		if (!d) return;

		const is_detail = this.active_pl_flow_view === 'detail';
		const sankey_data = is_detail ? d.sankey_detail : d.sankey_summary;

		if (!sankey_data) return;

		if (this._sankey_instance) {
			this._sankey_instance.dispose();
		}

		const chart = echarts.init(container);
		this._sankey_instance = chart;

		const option = {
			tooltip: {
				trigger: 'item',
				triggerOn: 'mousemove',
				formatter: function (params) {
					if (params.dataType === 'edge') {
						return `${params.data.source} → ${params.data.target}<br/>Value: ${d.currency_symbol}${params.data.value}M`;
					}
					return `${params.name}<br/>Value: ${d.currency_symbol}${params.value}M`;
				}
			},
			series: {
				type: 'sankey',
				layout: 'none',
				nodeAlign: 'justify',
				nodeGap: 30,
				nodeWidth: 20,
				emphasis: { focus: 'adjacency' },
				data: sankey_data.nodes,
				links: sankey_data.links,
				label: {
					position: 'right',
					fontSize: 13,
					fontWeight: 600,
					color: '#333333',
					formatter: function (params) {
						return `${params.name}\n${d.currency_symbol}${params.value}M`;
					}
				},
				lineStyle: {
					color: 'gradient',
					curveness: 0.5,
					opacity: 0.4
				},
				itemStyle: {
					borderWidth: 0
				},
				color: ['#002741', '#9b153e', '#edd6c8', '#333333', '#7a9e8f', '#1c6b4a', '#e3a627', '#d9824f']
			}
		};

		chart.setOption(option);

		window.addEventListener('resize', () => {
			chart.resize();
		});
	}

	inject_styles() {
		if (document.getElementById('financial-overview-styles')) {
			return;
		}

		const style = document.createElement('style');
		style.id = 'financial-overview-styles';

		style.innerHTML = `
		:root {
			--fo-primary: #002741;
			--fo-secondary: #edd6c8;
			--fo-accent: #9b153e;
			--fo-neutral: #333333;
			--fo-bg: #f9f7f4;
			--fo-card-bg: #ffffff;
			--fo-border: #e5e0d8;
			--fo-text-muted: #6b7280;
		}

		.fo-missing-panel {
			background: var(--fo-card-bg);
			border-radius: 16px;
			border: 1px dashed #d9d4cc;
			padding: 20px;
			margin-top: 20px;
		}

		.fo-missing-note {
			color: #999;
			font-size: 12px;
			margin: 6px 0 16px;
		}

		.fo-missing-list {
			margin: 0;
			padding-left: 20px;
			font-size: 13px;
			color: #333;
		}

		.fo-missing-list li { margin-bottom: 4px; }

		.fo-statement-summary-row {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 16px;
			margin-bottom: 20px;
		}

		.fo-statement-card {
			background: var(--fo-card-bg);
			border-radius: 14px;
			padding: 16px;
			border: 1px solid var(--fo-border);
			display: flex;
			flex-direction: column;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		}

		.fo-statement-card-top {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 10px;
		}

		.fo-ratios-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 18px;
		}

		.fo-ratio-block {
			background: var(--fo-card-bg);
			border-radius: 14px;
			padding: 20px 22px;
			border: 1px solid var(--fo-border);
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
		}

		.fo-ratio-block-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 18px;
			padding-bottom: 12px;
			border-bottom: 1px solid #f0eee9;
		}

		.fo-ratio-block-icon svg {
			width: 20px;
			height: 20px;
		}

		.fo-ratio-block-title {
			font-size: 16px;
			font-weight: 700;
			color: var(--fo-neutral);
		}

		.fo-ratio-block-rows {
			display: flex;
			flex-direction: column;
		}

		.fo-ratio-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 12px 0;
			border-bottom: 1px solid #f5f3ef;
		}

		.fo-ratio-row:last-child {
			border-bottom: none;
		}

		.fo-ratio-label {
			font-size: 13px;
			color: #555;
			font-weight: 500;
		}

		.fo-ratio-value-wrap {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.fo-ratio-value {
			font-size: 15px;
			font-weight: 800;
			color: var(--fo-neutral);
			font-variant-numeric: tabular-nums;
		}

		.fo-ratio-value-wrap .fo-badge {
			font-size: 11px;
			padding: 3px 8px;
		}

		@media (max-width: 1000px) {
			.fo-ratios-grid {
				grid-template-columns: 1fr;
			}
		}

		.fo-statement-card-label {
			color: #666;
			font-size: 12px;
			margin-bottom: 6px;
		}

		.fo-statement-card-value {
			font-size: 22px;
			font-weight: 800;
			margin-bottom: 4px;
		}

		.fo-statement-card-vs {
			color: #999;
			font-size: 11px;
		}

		.fo-filter-bar {
			width: calc(100% - 48px);
			max-width: 1200px;
			margin: 0 auto 16px auto;
			box-sizing: border-box;
			display: flex !important;
			align-items: flex-end;
			flex-wrap: wrap;
			gap: 14px;
			padding: 16px 18px;
			background: var(--fo-secondary);
			border: 1px solid var(--fo-border);
			border-radius: 14px;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
			position: relative;
			z-index: 20;
		}

		.fo-filter-field { flex: 1 1 220px; min-width: 200px; }

		.fo-filter-label {
			display: block;
			font-size: 12px;
			font-weight: 600;
			color: var(--fo-primary);
			margin: 0 0 7px 2px;
		}

		.fo-filter-control { width: 100%; }

		.fo-native-select {
			display: block;
			width: 100%;
			height: 40px;
			box-sizing: border-box;
			padding: 0 38px 0 13px;
			border: 1px solid var(--fo-border);
			border-radius: 8px;
			background: var(--fo-card-bg);
			color: var(--fo-neutral);
			font-size: 13px;
			font-weight: 500;
			outline: none;
			cursor: pointer;
			transition: border-color .15s ease, box-shadow .15s ease;
		}

		.fo-native-select:hover { border-color: var(--fo-primary); }

		.fo-native-select:focus {
			border-color: var(--fo-primary);
			box-shadow: 0 0 0 2px rgba(0, 39, 65, .12);
		}

		.fo-filter-bar .frappe-control {
			margin-bottom: 0 !important;
		}

		.fo-filter-bar .frappe-control .form-group {
			margin-bottom: 0 !important;
		}

		.fo-filter-bar .frappe-control .control-input-wrapper {
			margin: 0 !important;
		}

		.fo-filter-bar .frappe-control input[type="text"],
		.fo-filter-bar .frappe-control .input-with-feedback {
			display: block !important;
			width: 100% !important;
			height: 40px !important;
			box-sizing: border-box !important;
			padding: 0 38px 0 13px !important;
			border: 1px solid var(--fo-border) !important;
			border-radius: 8px !important;
			background: var(--fo-card-bg) !important;
			color: var(--fo-neutral) !important;
			font-size: 13px !important;
			font-weight: 500 !important;
			outline: none !important;
			transition: border-color .15s ease, box-shadow .15s ease;
		}

		.fo-filter-bar .frappe-control input[type="text"]:focus {
			border-color: var(--fo-primary) !important;
			box-shadow: 0 0 0 2px rgba(0, 39, 65, .12) !important;
		}

		.fo-filter-bar .frappe-control .help-box {
			display: none !important;
		}

		.fo-refresh-btn {
			flex: 0 0 auto;
			height: 40px;
			padding: 0 18px;
			border: 1px solid var(--fo-primary) !important;
			border-radius: 8px !important;
			background: var(--fo-primary) !important;
			color: #ffffff !important;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
		}

		.fo-refresh-btn:hover {
			background: #001a2b !important;
			border-color: #001a2b !important;
		}

		.fo-shell {
			display: flex;
			align-items: flex-start;
			gap: 0;
			width: calc(100% - 48px);
			max-width: 1200px;
			margin: 0 auto;
		}

		.fo-sidenav {
			flex: 0 0 170px;
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding: 4px;
			position: sticky;
			top: 12px;
		}

		.fo-sidenav-item {
			padding: 10px 14px;
			border-radius: 8px;
			font-size: 13px;
			font-weight: 600;
			color: var(--fo-primary);
			cursor: pointer;
			transition: background 0.15s, color 0.15s;
		}

		.fo-sidenav-item:hover { background: rgba(0, 39, 65, 0.08); }

		.fo-sidenav-active {
			background: var(--fo-primary);
			color: #ffffff;
		}

		.fo-shell-content { flex: 1 1 auto; min-width: 0; }

		.fo-page {
			background: var(--fo-bg);
			padding: 24px;
			font-family: var(--font-stack, 'Inter', sans-serif);
			color: var(--fo-neutral);
			position: relative;
		}

		.fo-loading-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			min-height: 300px;
			gap: 12px;
		}

		.fo-spinner {
			width: 34px;
			height: 34px;
			border: 3px solid var(--fo-border);
			border-top-color: var(--fo-primary);
			border-radius: 50%;
			animation: fo-spin 0.8s linear infinite;
		}

		@keyframes fo-spin { to { transform: rotate(360deg); } }

		.fo-loading-text { color: #777; font-size: 13px; }

		.fo-header {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 20px;
		}

		.fo-title { font-size: 34px; font-weight: 800; margin: 0; }

		.fo-title-accent { color: var(--fo-primary); font-weight: 700; }

		.fo-subtitle { color: #666; font-size: 14px; margin-top: 4px; }

		.fo-note { color: #999; font-size: 12px; padding-top: 6px; }

		.fo-stats-row {
			display: grid;
			grid-template-columns: 1.5fr 4fr;
			gap: 16px;
			margin-bottom: 16px;
		}

		.fo-hero-card {
			background: linear-gradient(160deg, var(--fo-primary) 0%, #001a2b 100%);
			border-radius: 16px;
			padding: 22px;
			color: #fff;
			position: relative;
			overflow: hidden;
			min-height: 340px;
			display: flex;
			flex-direction: column;
		}

		.fo-hero-top {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.fo-hero-label {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 14px;
			opacity: 0.9;
		}

		.fo-hero-label svg { width: 16px; height: 16px; }

		.fo-badge {
			border-radius: 20px;
			padding: 4px 10px;
			font-size: 12px;
			font-weight: 600;
			display: inline-flex;
			align-items: center;
			gap: 3px;
		}

		.fo-badge-hero { background: rgba(255, 255, 255, 0.15); color: #fff; }

		.fo-badge-up {
			background: #eaf7ef;
			color: var(--fo-primary);
			border: 1px solid #cdeadb;
		}

		.fo-badge-down {
			background: #fdece3;
			color: var(--fo-accent);
			border: 1px solid #f6d3bf;
		}

		.fo-hero-value { font-size: 40px; font-weight: 800; margin-top: 14px; }

		.fo-hero-divider {
			border-top: 1px solid rgba(255, 255, 255, 0.2);
			margin: 16px 0 12px;
		}

		.fo-hero-metrics { display: flex; gap: 26px; }

		.fo-hero-metric-label { font-size: 11px; opacity: 0.75; margin-bottom: 6px; }

		.fo-hero-metric-value { font-size: 15px; font-weight: 700; }

		.fo-hero-metric-badge {
			background: rgba(255, 255, 255, 0.15);
			border-radius: 6px;
			padding: 3px 8px;
			font-size: 13px;
			font-weight: 700;
		}

		.fo-hero-legend {
			margin-top: auto;
			display: flex;
			gap: 16px;
			font-size: 12px;
			opacity: 0.85;
			padding-top: 18px;
		}

		.fo-line-swatch {
			display: inline-block;
			width: 14px;
			height: 2px;
			margin-right: 5px;
			vertical-align: middle;
		}

		.fo-line-2025 { background: #fff; }
		.fo-line-2024 { background: rgba(255, 255, 255, 0.5); }

		.fo-hero-spark { width: 100%; height: 50px; margin-top: 6px; }

		.fo-stats-grid {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 16px;
		}

		.fo-card {
			background: var(--fo-card-bg);
			border-radius: 16px;
			padding: 18px;
			border: 1px solid var(--fo-border);
			display: flex;
			flex-direction: column;
		}

		.fo-card-top {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.fo-icon { color: var(--fo-primary); }

		.fo-icon svg { width: 20px; height: 20px; }

		.fo-card-label { color: #666; font-size: 13px; margin-top: 10px; }

		.fo-card-value { font-size: 26px; font-weight: 800; margin-top: 4px; }

		.fo-card-vs {
			color: #999;
			font-size: 12px;
			margin: 4px 0 10px;
			border-bottom: 2px solid #eee;
			padding-bottom: 10px;
		}

		.fo-bars {
			display: flex;
			align-items: flex-end;
			gap: 8px;
			height: 70px;
			margin-top: auto;
		}

		.fo-bar-col {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			height: 100%;
			justify-content: flex-end;
			cursor: pointer;
		}

		.fo-bar {
			width: 100%;
			max-width: 26px;
			background: var(--fo-primary);
			border-radius: 3px 3px 0 0;
			transition: opacity 0.15s;
		}

		.fo-bar-col:hover .fo-bar { opacity: 0.75; }

		.fo-bar-orange { background: var(--fo-accent); }

		.fo-bar-label { font-size: 10px; color: #aaa; margin-top: 5px; }

		.fo-panels-row {
			display: grid;
			grid-template-columns: 1fr 1.7fr;
			gap: 16px;
		}

		.fo-panel {
			background: var(--fo-card-bg);
			border-radius: 16px;
			padding: 22px;
			border: 1px solid var(--fo-border);
		}

		.fo-panel-title { font-weight: 700; font-size: 16px; margin-bottom: 20px; }

		.fo-panel-subtitle {
			color: #999;
			font-size: 12px;
			margin-top: -14px;
			margin-bottom: 18px;
		}

		.fo-breakdown-body {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 30px;
		}

		.fo-legend {
			width: 100%;
			display: flex;
			flex-direction: column;
			gap: 18px;
		}

		.fo-legend-row {
			display: flex;
			align-items: center;
			gap: 10px;
			cursor: pointer;
			padding: 4px;
			border-radius: 8px;
			transition: background 0.15s;
		}

		.fo-legend-row:hover { background: #f5f7f6; }

		.fo-dot {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			flex-shrink: 0;
			display: inline-block;
		}

		.fo-dot-hollow { background: #fff !important; border: 2px solid; }

		.fo-legend-label { font-size: 13px; font-weight: 600; }

		.fo-legend-value { font-size: 12px; color: #777; }

		.fo-legend-pct { color: #aaa; }

		.fo-donut-wrap {
			position: relative;
			width: 200px;
			height: 200px;
		}

		.fo-donut-svg {
			width: 200px;
			height: 200px;
			overflow: visible;
		}

		.fo-donut-slice {
			cursor: pointer;
			transition: opacity 0.15s, transform 0.15s;
			transform-origin: 100px 100px;
		}

		.fo-donut-slice-active { transform: scale(1.035); }
		.fo-donut-slice-dim { opacity: 0.45; }

		.fo-donut-center {
			position: absolute;
			inset: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			pointer-events: none;
		}

		.fo-donut-total-label { font-size: 12px; color: #888; }
		.fo-donut-total-value { font-size: 20px; font-weight: 800; }

		.fo-trend-chart-wrap { position: relative; }
		.fo-trend-svg { width: 100%; height: 360px; }

		.fo-axis-label { font-size: 11px; fill: #999; font-family: inherit; }
		.fo-axis-label-active { fill: var(--fo-neutral); font-weight: 700; }

		#fo-trend-overlay { cursor: crosshair; }

		.fo-trend-legend {
			display: flex;
			justify-content: flex-end;
			gap: 16px;
			font-size: 12px;
			color: #666;
			margin-top: -8px;
		}

		.fo-statement-panel {
			background: var(--fo-card-bg);
			border-radius: 16px;
			border: 1px solid var(--fo-border);
			overflow: hidden;
		}

		.fo-statement-table {
			width: 100%;
			border-collapse: collapse;
			font-size: 13px;
		}

		.fo-statement-table th {
			padding: 14px 18px;
			background: var(--fo-secondary);
			color: var(--fo-primary);
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			border-bottom: 2px solid var(--fo-border);
		}

		.fo-statement-table th.fo-st-line,
		.fo-statement-table td.fo-st-line { text-align: left; }

		.fo-statement-table td {
			padding: 10px 18px;
			border-bottom: 1px solid #f0eee9;
		}

		.fo-st-group-row td {
			background: var(--fo-secondary);
			font-weight: 700;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			color: var(--fo-primary);
			padding-top: 14px;
			padding-bottom: 8px;
		}

		.fo-st-section-row td {
			background: var(--fo-primary);
			color: #fff;
			font-weight: 800;
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			padding: 14px 18px;
			border-top: 2px solid var(--fo-primary);
			border-bottom: 1px solid var(--fo-border);
		}

		.fo-st-line-row td.fo-st-line {
			padding-left: 30px;
			color: var(--fo-neutral);
		}

		.fo-st-total-row td {
			background: rgba(0, 39, 65, 0.05);
			font-weight: 700;
			color: var(--fo-primary);
		}

		.fo-st-calc-row td {
			background: var(--fo-primary);
			color: #fff;
			font-weight: 800;
			font-size: 14px;
		}

		.fo-st-var-up { color: var(--fo-primary); font-weight: 600; }
		.fo-st-calc-row .fo-st-var-up { color: #a9e8c4; }
		.fo-st-var-down { color: var(--fo-accent); font-weight: 600; }
		.fo-st-calc-row .fo-st-var-down { color: #f6c2a4; }

		.fo-value-negative { color: var(--fo-accent) !important; font-weight: 600; }

		.fo-statement-empty {
			background: var(--fo-card-bg);
			border: 1px dashed #d9d4cc;
			border-radius: 16px;
			padding: 40px 24px;
			text-align: center;
			color: #777;
			font-size: 13px;
		}

		.fo-tooltip {
			position: absolute;
			z-index: 50;
			background: var(--fo-card-bg);
			border-radius: 10px;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
			padding: 10px 14px;
			font-size: 12px;
			pointer-events: none;
			opacity: 0;
			transform: translateY(4px);
			transition: opacity 0.12s, transform 0.12s;
			white-space: nowrap;
		}

		.fo-tooltip-visible { opacity: 1; transform: translateY(0); }

		.fo-tooltip-bar {
			transform: translate(-50%, -100%);
			font-weight: 600;
			color: var(--fo-neutral);
		}

		.fo-tooltip-donut {
			width: 220px;
			white-space: normal;
			transform: translateY(-50%);
		}

		.fo-popup-header {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 14px;
			margin-bottom: 6px;
		}

		.fo-popup-total-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			margin-bottom: 10px;
		}

		.fo-popup-total-value { font-size: 20px; font-weight: 800; }
		.fo-popup-total-pct { color: var(--fo-primary); font-weight: 700; font-size: 13px; }

		.fo-popup-sub-heading {
			font-size: 10px;
			letter-spacing: 0.05em;
			color: #aaa;
			margin-bottom: 8px;
		}

		.fo-popup-sub-row { margin-bottom: 8px; }

		.fo-popup-sub-top {
			display: flex;
			justify-content: space-between;
			font-size: 12px;
			margin-bottom: 4px;
		}

		.fo-popup-sub-value { font-weight: 700; }

		.fo-popup-sub-track {
			height: 4px;
			background: #eee;
			border-radius: 4px;
			overflow: hidden;
		}

		.fo-popup-sub-fill { height: 100%; border-radius: 4px; }

		.fo-popup-sub-empty { font-size: 12px; color: #999; }

		.fo-tooltip-trend {
			background: var(--fo-primary);
			color: #fff;
			transform: translate(-50%, -100%);
			min-width: 180px;
		}

		.fo-trend-tip-header {
			display: flex;
			align-items: center;
			gap: 6px;
			font-weight: 700;
			font-size: 13px;
			margin-bottom: 8px;
		}

		.fo-trend-tip-header svg { width: 13px; height: 13px; }

		.fo-trend-tip-row {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 12px;
			margin-bottom: 4px;
			opacity: 0.9;
		}

		.fo-trend-tip-row b { margin-left: auto; }

		.fo-trend-tip-yoy {
			margin-top: 6px;
			padding-top: 6px;
			border-top: 1px solid rgba(255, 255, 255, 0.25);
			display: flex;
			gap: 8px;
			align-items: center;
			font-size: 12px;
		}

		.fo-yoy-up { color: #a9e8c4; font-weight: 700; }
		.fo-yoy-down { color: #f6c2a4; font-weight: 700; }
		.fo-trend-tip-amount { opacity: 0.8; }

		.fo-trends-header {
			align-items: center;
			margin-bottom: 22px;
		}

		.fo-header-actions {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.fo-print-btn {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 8px 16px;
			border-radius: 8px;
			border: 1px solid var(--fo-primary);
			background: #fff;
			color: var(--fo-primary);
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.18s ease;
			font-family: inherit;
		}

		.fo-print-btn svg {
			width: 15px;
			height: 15px;
		}

		.fo-print-btn:hover {
			background: var(--fo-primary);
			color: #fff;
		}

		.fo-trends-toggle {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			background: var(--fo-card-bg);
			border: 1px solid var(--fo-border);
			border-radius: 999px;
			padding: 4px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
		}

		.fo-toggle-btn {
			display: inline-flex;
			align-items: center;
			gap: 7px;
			padding: 8px 16px;
			border-radius: 999px;
			border: none;
			background: transparent;
			color: var(--fo-primary);
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.18s ease;
			white-space: nowrap;
			font-family: inherit;
		}

		.fo-toggle-btn svg {
			width: 15px;
			height: 15px;
		}

		.fo-toggle-btn:hover {
			color: var(--fo-primary);
		}

		.fo-toggle-btn-active {
			background: var(--fo-primary);
			color: #ffffff !important;
			box-shadow: 0 2px 6px rgba(0, 39, 65, 0.25);
		}

		.fo-toggle-btn-active svg {
			color: #ffffff;
		}

		/* ============================================================
		   TRENDS TAB — FULL WIDTH CHARTS WITH RIGHT-SIDE LEGEND
		   ============================================================ */
		.fo-trends-layout {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}

		.fo-trends-left {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}

		.fo-margin-cards-row {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 16px;
			margin-top: 16px;
		}

		.fo-chart-with-legend {
			display: flex;
			align-items: stretch;
			gap: 24px;
		}

		.fo-chart-area {
			flex: 1 1 auto;
			min-width: 0;
		}

		.fo-chart-legend-vertical {
			flex: 0 0 160px;
			display: flex;
			flex-direction: column;
			gap: 12px;
			justify-content: center;
			padding: 8px 0;
		}

		.fo-chart-legend-item {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 12px;
			color: #444;
			font-weight: 500;
			white-space: nowrap;
		}

		.fo-chart-legend-swatch {
			width: 12px;
			height: 12px;
			border-radius: 3px;
			flex-shrink: 0;
		}

		.fo-quarterly-bars-wrap { width: 100%; min-height: 340px; }
		.fo-quarterly-svg { width: 100%; height: 340px; }

		.fo-margin-trend-chart-wrap { width: 100%; min-height: 320px; }
		.fo-margin-trend-svg { width: 100%; height: 320px; }

		.fo-bar-segment {
			cursor: pointer;
			transition: opacity 0.15s;
		}

		.fo-bar-segment:hover { opacity: 0.8; }

		.fo-margin-card {
			background: var(--fo-card-bg);
			border-radius: 14px;
			padding: 18px;
			border: 1px solid var(--fo-border);
		}

		.fo-margin-card-top {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 10px;
		}

		.fo-margin-card-label {
			color: #666;
			font-size: 13px;
			font-weight: 600;
		}

		.fo-margin-card-diff {
			font-size: 11px;
			padding: 3px 8px;
			border-radius: 20px;
			font-weight: 600;
		}

		.fo-margin-card-value {
			font-size: 28px;
			font-weight: 800;
			margin-bottom: 10px;
		}

		.fo-margin-card-bar-track {
			height: 5px;
			background: #eee;
			border-radius: 3px;
			overflow: hidden;
		}

		.fo-margin-card-bar-fill {
			height: 100%;
			border-radius: 3px;
		}

		.fo-costs-layout {
			display: grid;
			grid-template-columns: 1fr 1.6fr;
			gap: 16px;
			margin-bottom: 16px;
		}

		.fo-costs-left {
			display: flex;
			flex-direction: column;
			gap: 14px;
		}

		.fo-cost-left-card {
			background: var(--fo-card-bg);
			border-radius: 14px;
			padding: 16px 18px;
			border: 1px solid var(--fo-border);
		}

		.fo-cost-left-top {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 8px;
		}

		.fo-cost-left-label {
			color: #666;
			font-size: 13px;
			font-weight: 600;
		}

		.fo-cost-left-value {
			font-size: 24px;
			font-weight: 800;
			margin-bottom: 8px;
		}

		.fo-cost-spark { width: 100%; height: 40px; }

		.fo-costs-right { min-width: 0; }

		.fo-panel-title-row {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			margin-bottom: 18px;
		}

		.fo-opex-total {
			font-size: 12px;
			color: var(--fo-primary);
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.fo-opex-list {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}

		.fo-opex-row-top {
			display: flex;
			justify-content: space-between;
			font-size: 13px;
			margin-bottom: 6px;
		}

		.fo-opex-row-label { color: var(--fo-neutral); font-weight: 500; }

		.fo-opex-row-value {
			font-weight: 700;
			color: var(--fo-neutral);
			display: inline-flex;
			align-items: center;
			gap: 8px;
		}

		.fo-opex-row-change { font-size: 11px; font-weight: 600; }

		.fo-opex-row-track {
			height: 8px;
			background: #f0eee9;
			border-radius: 4px;
			overflow: hidden;
		}

		.fo-opex-row-fill {
			height: 100%;
			border-radius: 4px;
			transition: width 0.4s ease;
		}

		.fo-costs-bottom-row {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 16px;
		}

		.fo-cost-bottom-card {
			background: var(--fo-card-bg);
			border-radius: 14px;
			padding: 18px;
			border: 1px solid var(--fo-border);
		}

		.fo-cost-bottom-label {
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: #999;
			margin-bottom: 6px;
		}

		.fo-cost-bottom-value {
			font-size: 22px;
			font-weight: 800;
			margin-bottom: 4px;
		}

		.fo-cost-bottom-prior { font-size: 11px; color: #999; }

		/* ============================================================
		   P&L FLOW TAB — MAIN CHART FULL WIDTH, BRIDGE AS POPUP OVERLAY
		   ============================================================ */
		.fo-pl-flow-page {
			position: relative;
			min-height: 640px;
		}

		.fo-pl-flow-container {
			display: flex;
			gap: 0;
			height: 640px;
		}

		.fo-pl-flow-main {
			flex: 1 1 auto;
			display: flex;
			flex-direction: column;
			min-width: 0;
			width: 100%;
		}

		.fo-pl-flow-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
		}

		.fo-pl-flow-header-actions {
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.fo-pl-flow-chart-wrap {
			background: var(--fo-card-bg);
			border-radius: 16px;
			border: 1px solid var(--fo-border);
			padding: 24px;
			flex: 1 1 auto;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 4px 12px rgba(0,0,0,0.04);
		}

		.fo-sankey-chart {
			width: 100%;
			height: 100%;
			min-height: 540px;
		}

		/* Bridge popup toggle arrow button */
		.fo-bridge-toggle-btn {
			width: 42px;
			height: 42px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			border: 1px solid var(--fo-primary);
			background: #fff;
			color: var(--fo-primary);
			cursor: pointer;
			transition: all 0.2s ease;
			box-shadow: 0 2px 6px rgba(0, 39, 65, 0.12);
			padding: 0;
		}

		.fo-bridge-toggle-btn svg {
			width: 18px;
			height: 18px;
			transition: transform 0.25s ease;
		}

		.fo-bridge-toggle-btn:hover {
			background: var(--fo-primary);
			color: #fff;
			transform: translateY(-1px);
			box-shadow: 0 4px 10px rgba(0, 39, 65, 0.25);
		}

		.fo-bridge-toggle-btn-active {
			background: var(--fo-primary);
			color: #fff;
			box-shadow: 0 4px 10px rgba(0, 39, 65, 0.28);
		}

		.fo-bridge-toggle-btn-active svg {
			transform: rotate(180deg);
		}

		/* Popup overlay backdrop */
		.fo-bridge-popup-overlay {
			position: absolute;
			inset: 0;
			background: rgba(0, 20, 35, 0);
			pointer-events: none;
			transition: background 0.25s ease;
			z-index: 30;
			border-radius: 16px;
		}

		.fo-bridge-popup-overlay-open {
			background: rgba(0, 20, 35, 0.28);
			pointer-events: auto;
		}

		/* Bridge popup panel (slide-in from right) */
		.fo-bridge-popup {
			position: absolute;
			top: 0;
			right: 0;
			width: 420px;
			max-width: 92%;
			height: 100%;
			background: var(--fo-card-bg);
			border-radius: 16px;
			border: 1px solid var(--fo-border);
			padding: 22px;
			display: flex;
			flex-direction: column;
			box-shadow: -12px 0 32px rgba(0, 20, 35, 0.18);
			transform: translateX(110%);
			opacity: 0;
			pointer-events: none;
			transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease;
			z-index: 40;
			overflow: hidden;
		}

		.fo-bridge-popup-open {
			transform: translateX(0);
			opacity: 1;
			pointer-events: auto;
		}

		.fo-bridge-popup-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 18px;
			padding-bottom: 14px;
			border-bottom: 1px solid var(--fo-border);
		}

		.fo-bridge-popup-title {
			font-size: 16px;
			font-weight: 700;
			color: var(--fo-primary);
		}

		.fo-bridge-popup-close {
			width: 32px;
			height: 32px;
			border-radius: 50%;
			border: none;
			background: #f3f1ec;
			color: #666;
			font-size: 22px;
			line-height: 1;
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			transition: all 0.15s ease;
			padding: 0;
		}

		.fo-bridge-popup-close:hover {
			background: var(--fo-accent);
			color: #fff;
		}

		.fo-bridge-popup-toggle {
			display: inline-flex;
			align-self: flex-start;
			margin-bottom: 16px;
		}

		.fo-bridge-chart-sidebar {
			flex: 1 1 auto;
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 0;
		}

		.fo-bridge-svg {
			width: 100%;
			height: 100%;
			max-height: 400px;
		}

		.fo-bridge-bar-label {
			font-size: 14px;
			font-weight: 800;
			fill: var(--fo-neutral);
		}

		.fo-bridge-badge-text {
			font-size: 10px;
			font-weight: 700;
		}

		.fo-value-up { color: var(--fo-primary); }
		.fo-value-down { color: var(--fo-accent); }

		.fo-bridge-footer {
			display: flex;
			justify-content: space-between;
			padding-top: 16px;
			margin-top: auto;
			border-top: 1px solid var(--fo-border);
		}

		.fo-bridge-footer-item {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		.fo-bridge-footer-label {
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: #999;
		}

		.fo-bridge-footer-value {
			font-size: 14px;
			font-weight: 800;
			color: var(--fo-neutral);
		}

		@media (max-width: 1100px) {
			.fo-statement-summary-row { grid-template-columns: repeat(2, 1fr); }
			.fo-stats-row, .fo-panels-row { grid-template-columns: 1fr; }
			.fo-stats-grid { grid-template-columns: repeat(2, 1fr); }
			.fo-costs-layout { grid-template-columns: 1fr; }
			.fo-costs-bottom-row { grid-template-columns: 1fr; }
			.fo-margin-cards-row { grid-template-columns: repeat(2, 1fr); }
			.fo-chart-with-legend { flex-direction: column; }
			.fo-chart-legend-vertical {
				flex-direction: row;
				flex-wrap: wrap;
				justify-content: flex-start;
				flex: 0 0 auto;
				padding-top: 12px;
			}
			.fo-pl-flow-container { height: auto; min-height: 500px; }
		}

		@media (max-width: 900px) {
			.fo-shell { flex-direction: column; }
			.fo-sidenav {
				flex-direction: row;
				position: static;
				width: 100%;
				overflow-x: auto;
			}
			.fo-bridge-popup { width: 100%; max-width: 100%; }
		}

		@media (max-width: 768px) {
			.fo-statement-summary-row { grid-template-columns: 1fr; }
			.fo-margin-cards-row { grid-template-columns: 1fr; }
		}

		@media (max-width: 700px) {
			.fo-filter-bar { width: calc(100% - 24px); padding: 14px; }
			.fo-filter-field { flex-basis: 100%; }
			.fo-refresh-btn { width: 100%; }
		}
		`;

		document.head.appendChild(style);
	}
}