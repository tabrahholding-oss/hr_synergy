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
		this.data = null;
		this.inject_styles();
		this.setup_filters();
		this.load();
	}

	/* ---------------------------------------------------------
	 *  Filters (company / fiscal year) — drive the live data
	 * --------------------------------------------------------- */
	setup_filters() {
		this.company_field = this.page.add_field({
			fieldname: 'company',
			label: __('Company'),
			fieldtype: 'Link',
			options: 'Company',
			default: frappe.defaults.get_user_default('Company'),
			change: () => this.load()
		});

		this.fiscal_year_field = this.page.add_field({
			fieldname: 'fiscal_year',
			label: __('Fiscal Year'),
			fieldtype: 'Link',
			options: 'Fiscal Year',
			change: () => this.load()
		});
	}

	load() {
		this.render_loading();
		frappe.call({
			method: this.method,
			args: {
				company: this.company_field.get_value(),
				fiscal_year: this.fiscal_year_field.get_value()
			},
			callback: (r) => {
				if (!r.message) {
					console.error('Financial Overview returned no data', r);
					this.render_error();
					return;
				}

				try {
					this.data = r.message;
					if (!this.fiscal_year_field.get_value()) {
						this.fiscal_year_field.set_value(this.data.fiscal_year);
					}
					this.render();
				} catch (error) {
					console.error('Financial Overview failed while rendering', error, r.message);
					this.render_error(error);
				}
			},
			error: (xhr) => {
				console.error('Financial Overview request failed', xhr);
				this.render_error();
			}
		});
	}

	render_loading() {
		$(this.page.body).html(`
			<div class="fo-page fo-loading-state">
				<div class="fo-spinner"></div>
				<div class="fo-loading-text">${__('Loading financial data...')}</div>
			</div>
		`);
	}

	render_error(error) {
		const detail = error && error.message ? `<div class="fo-error-detail">${frappe.utils.escape_html(error.message)}</div>` : '';
		$(this.page.body).html(`
			<div class="fo-page fo-loading-state">
				<div class="fo-loading-text">${__('Could not load financial data. Please check the server logs.')}</div>
				${detail}
			</div>
		`);
	}

	/* ---------------------------------------------------------
	 *  Main render
	 * --------------------------------------------------------- */
	render() {
		const d = this.data;
		const $body = $(this.page.body);
		$body.empty();
		$body.append(this.get_html(d));

		this.$tooltip = $(this.page.body).find('.fo-tooltip');

		this.render_donut(d.revenue_breakdown);
		this.render_trend_chart(d.trend);
		this.wire_bar_tooltips();
	}

	/* ---------------------------------------------------------
	 *  Icons
	 * --------------------------------------------------------- */
	icon(name) {
		const icons = {
			'dollar-sign': '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
			'bar-chart-2': '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
			'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
			'pie-chart': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>',
			'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
			'calendar': '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>'
		};
		return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
	}

	/* ---------------------------------------------------------
	 *  HTML template
	 * --------------------------------------------------------- */
	get_html(d) {
		const stat_cards_html = d.stat_cards.map(c => `
			<div class="fo-card">
				<div class="fo-card-top">
					<span class="fo-icon">${this.icon(c.icon)}</span>
					<span class="fo-badge ${c.change_pct >= 0 ? 'fo-badge-up' : 'fo-badge-down'}">
						${c.change_pct >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(c.change_pct)}%
					</span>
				</div>
				<div class="fo-card-label">${c.label}</div>
				<div class="fo-card-value">${c.value_fmt}</div>
				<div class="fo-card-vs">vs. ${c.prior_value_fmt}</div>
				<div class="fo-bars" data-card="${c.key}">
					${c.quarters.map((q, i) => `
						<div class="fo-bar-col"
							data-quarter="${q.label}"
							data-change="${q.change_pct}">
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
					<div class="fo-legend-value">${r.value_fmt} <span class="fo-legend-pct">(${r.pct}%)</span></div>
				</div>
			</div>
		`).join('');

		return `
		<div class="fo-page">
			<div class="fo-header">
				<div>
					<h1 class="fo-title">Financial <span class="fo-title-accent">Overview</span></h1>
					<div class="fo-subtitle">${d.company} | ${d.fiscal_year} Performance</div>
				</div>
				<div class="fo-note">${__('Live data from your accounting records.')}</div>
			</div>

			<div class="fo-stats-row">
				<div class="fo-hero-card">
					<div class="fo-hero-top">
						<span class="fo-hero-label">${this.icon('camera')} ${__('Total Revenue')}</span>
						<span class="fo-badge fo-badge-hero">
							${d.total_revenue.change_pct >= 0 ? '&#8599;' : '&#8600;'} ${Math.abs(d.total_revenue.change_pct)}%
						</span>
					</div>
					<div class="fo-hero-value">${d.total_revenue.value_fmt}</div>
					<div class="fo-hero-divider"></div>
					<div class="fo-hero-metrics">
						<div>
							<div class="fo-hero-metric-label">${__('vs')} ${d.prior_fiscal_year || ''}</div>
							<span class="fo-hero-metric-badge">${d.total_revenue.vs_amount_fmt}</span>
						</div>
						<div>
							<div class="fo-hero-metric-label">${__('Gross Margin')}</div>
							<div class="fo-hero-metric-value">${d.total_revenue.gross_margin}%</div>
						</div>
						<div>
							<div class="fo-hero-metric-label">${__('Net Margin')}</div>
							<div class="fo-hero-metric-value">${d.total_revenue.net_margin}%</div>
						</div>
					</div>
					<div class="fo-hero-legend">
						<span><i class="fo-line-swatch fo-line-2025"></i>${d.fiscal_year}</span>
						<span><i class="fo-line-swatch fo-line-2024"></i>${d.prior_fiscal_year || ''}</span>
					</div>
					<svg class="fo-hero-spark" viewBox="0 0 300 60" preserveAspectRatio="none">
						<path d="${this.get_spark_path(d.trend)}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2"/>
					</svg>
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
		if (!trend || !trend.current || !trend.current.length) return 'M0,30 L300,30';
		const vals = trend.current.map(c => c.value);
		const min = Math.min(...vals), max = Math.max(...vals) || 1;
		const w = 300, h = 60;
		return vals.map((v, i) => {
			const x = (w * i) / (vals.length - 1);
			const y = h - ((v - min) / (max - min || 1)) * h;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	/* ---------------------------------------------------------
	 *  Generic tooltip helpers
	 * --------------------------------------------------------- */
	show_tooltip(html, x, y, extra_class) {
		this.$tooltip
			.attr('class', 'fo-tooltip fo-tooltip-visible ' + (extra_class || ''))
			.html(html)
			.css({ left: x + 'px', top: y + 'px' });
	}

	hide_tooltip() {
		if (this.$tooltip) this.$tooltip.removeClass('fo-tooltip-visible');
	}

	/* ---------------------------------------------------------
	 *  Mini bar chart hover (image 3)
	 * --------------------------------------------------------- */
	wire_bar_tooltips() {
		const $page = $(this.page.body).find('.fo-page');
		const page_offset = $page.offset();

		$page.find('.fo-bar-col').on('mouseenter', (e) => {
			const $col = $(e.currentTarget);
			const q = $col.data('quarter');
			const change = parseFloat($col.data('change'));
			const sign = change >= 0 ? '+' : '';
			const pos = $col.find('.fo-bar')[0].getBoundingClientRect();
			const x = pos.left - page_offset.left + pos.width / 2 - $(window).scrollLeft();
			const y = pos.top - page_offset.top - 8 - $(window).scrollTop();

			this.show_tooltip(
				`<b>${q}:</b> ${sign}${change}%`,
				x, y,
				'fo-tooltip-bar'
			);
		}).on('mouseleave', () => this.hide_tooltip());
	}

	/* ---------------------------------------------------------
	 *  Donut chart — built as SVG arc segments so each slice
	 *  can be hovered individually (image 1)
	 * --------------------------------------------------------- */
	render_donut(breakdown) {
		const $svg = $('#fo-donut-svg');
		const cx = 100, cy = 100, r_outer = 100, r_inner = 66;
		let acc = 0;
		const paths = [];

		breakdown.forEach((seg, i) => {
			const start_angle = (acc / 100) * 360;
			acc += seg.pct;
			const end_angle = (acc / 100) * 360;
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
		const unhighlight = () => {
			$svg.find('.fo-donut-slice').removeClass('fo-donut-slice-dim fo-donut-slice-active');
		};

		const show_breakdown = (i, target_rect) => {
			const seg = breakdown[i];
			const sub_html = (seg.sub_items || []).map(s => `
				<div class="fo-popup-sub-row">
					<div class="fo-popup-sub-top">
						<span>${s.label}</span>
						<span class="fo-popup-sub-value">${s.value_fmt}</span>
					</div>
					<div class="fo-popup-sub-track"><div class="fo-popup-sub-fill" style="width:${s.bar_pct}%; background:${seg.color}"></div></div>
				</div>
			`).join('');

			const html = `
				<div class="fo-popup-header">
					<span class="fo-dot" style="background:${seg.color}"></span>
					<b>${seg.label}</b>
				</div>
				<div class="fo-popup-total-row">
					<span class="fo-popup-total-value">${seg.value_fmt}</span>
					<span class="fo-popup-total-pct">${seg.pct}%</span>
				</div>
				<div class="fo-popup-sub-heading">${__('BREAKDOWN')}</div>
				${sub_html || `<div class="fo-popup-sub-empty">${__('No item-level data')}</div>`}
			`;

			const x = target_rect.left - page_offset.left + target_rect.width + 12 - $(window).scrollLeft();
			const y = target_rect.top - page_offset.top - $(window).scrollTop();
			this.show_tooltip(html, x, y, 'fo-tooltip-donut');
		};

		$svg.find('.fo-donut-slice').on('mouseenter', (e) => {
			const i = $(e.currentTarget).data('slice');
			highlight(i);
			const rect = $('.fo-donut-wrap')[0].getBoundingClientRect();
			show_breakdown(i, rect);
		}).on('mouseleave', () => {
			unhighlight();
			this.hide_tooltip();
		});

		// legend rows mirror the same hover behaviour
		$(this.page.body).find('.fo-legend-row').on('mouseenter', (e) => {
			const i = $(e.currentTarget).data('slice');
			highlight(i);
			const rect = $('.fo-donut-wrap')[0].getBoundingClientRect();
			show_breakdown(i, rect);
		}).on('mouseleave', () => {
			unhighlight();
			this.hide_tooltip();
		});
	}

	donut_arc_path(cx, cy, r_outer, r_inner, start_angle, end_angle) {
		// keep a tiny gap between slices
		const gap = 1.2;
		start_angle += gap;
		end_angle -= gap;
		if (end_angle < start_angle) end_angle = start_angle;

		const to_xy = (angle, r) => {
			const rad = ((angle - 90) * Math.PI) / 180;
			return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
		};
		const large_arc = end_angle - start_angle > 180 ? 1 : 0;
		const [x1, y1] = to_xy(start_angle, r_outer);
		const [x2, y2] = to_xy(end_angle, r_outer);
		const [x3, y3] = to_xy(end_angle, r_inner);
		const [x4, y4] = to_xy(start_angle, r_inner);

		return [
			`M ${x1} ${y1}`,
			`A ${r_outer} ${r_outer} 0 ${large_arc} 1 ${x2} ${y2}`,
			`L ${x3} ${y3}`,
			`A ${r_inner} ${r_inner} 0 ${large_arc} 0 ${x4} ${y4}`,
			'Z'
		].join(' ');
	}

	/* ---------------------------------------------------------
	 *  Trend line chart with crosshair hover (image 2)
	 * --------------------------------------------------------- */
	render_trend_chart(trend) {
		const W = 1000, H = 380, PAD_L = 50, PAD_R = 20, PAD_T = 20, PAD_B = 30;
		const plot_w = W - PAD_L - PAD_R;
		const plot_h = H - PAD_T - PAD_B;
		const points = trend.current;
		const y_min = trend.y_min, y_max = trend.y_max;

		const x = i => PAD_L + (plot_w * i) / (points.length - 1);
		const y = v => PAD_T + plot_h - ((v - y_min) / (y_max - y_min || 1)) * plot_h;

		const to_path = key => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

		const path_current = to_path('value');
		const path_prior = to_path('prior');
		const area_current = `${path_current} L${x(points.length - 1).toFixed(1)},${(PAD_T + plot_h).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + plot_h).toFixed(1)} Z`;

		const grid_vals = [];
		const steps = 4;
		for (let i = 0; i <= steps; i++) grid_vals.push(y_min + ((y_max - y_min) * i) / steps);

		const gridlines = grid_vals.map(v => `
			<line x1="${PAD_L}" y1="${y(v).toFixed(1)}" x2="${W - PAD_R}" y2="${y(v).toFixed(1)}"
				stroke="#e3e3e3" stroke-width="1" stroke-dasharray="3,4"/>
			<text x="${PAD_L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="fo-axis-label">$${v.toFixed(1)}M</text>
		`).join('');

		const x_labels = points.map((p, i) => `
			<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="fo-axis-label" id="fo-month-label-${i}">${p.month}</text>
		`).join('');

		const svg = `
			<svg viewBox="0 0 ${W} ${H}" class="fo-trend-svg" id="fo-trend-svg">
				<defs>
					<linearGradient id="fo-area-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#1c6b4a" stop-opacity="0.28"/>
						<stop offset="100%" stop-color="#1c6b4a" stop-opacity="0"/>
					</linearGradient>
				</defs>
				${gridlines}
				${x_labels}
				<path d="${area_current}" fill="url(#fo-area-fill)" stroke="none"/>
				<path d="${path_prior}" fill="none" stroke="#8fc9a9" stroke-width="2.5"/>
				<path d="${path_current}" fill="none" stroke="#1c6b4a" stroke-width="2.5"/>

				<line id="fo-crosshair" x1="0" y1="${PAD_T}" x2="0" y2="${PAD_T + plot_h}"
					stroke="#1c6b4a" stroke-width="1" stroke-dasharray="3,4" style="display:none"/>
				<circle id="fo-dot-current" r="4.5" fill="#1c6b4a" stroke="#fff" stroke-width="2" style="display:none"/>
				<circle id="fo-dot-prior" r="4.5" fill="#fff" stroke="#8fc9a9" stroke-width="2" style="display:none"/>

				<rect x="${PAD_L}" y="${PAD_T}" width="${plot_w}" height="${plot_h}" fill="transparent" id="fo-trend-overlay"/>
			</svg>
			<div class="fo-trend-legend">
				<span><i class="fo-line-swatch" style="background:#1c6b4a"></i>${this.data.fiscal_year}</span>
				<span><i class="fo-line-swatch" style="background:#8fc9a9"></i>${this.data.prior_fiscal_year || ''}</span>
			</div>
		`;
		$('#fo-trend-chart').html(svg);

		const $svg_el = $('#fo-trend-svg')[0];
		const $overlay = $('#fo-trend-overlay');
		const page_offset = $(this.page.body).find('.fo-page').offset();

		$overlay.on('mousemove', (e) => {
			const pt = $svg_el.createSVGPoint();
			pt.x = e.clientX;
			pt.y = e.clientY;
			const svg_p = pt.matrixTransform($svg_el.getScreenCTM().inverse());

			// find nearest month index
			let idx = Math.round(((svg_p.x - PAD_L) / plot_w) * (points.length - 1));
			idx = Math.max(0, Math.min(points.length - 1, idx));

			const p = points[idx];
			const cx = x(idx), cy_val = y(p.value), py_val = y(p.prior);

			$('#fo-crosshair').attr({ x1: cx, x2: cx }).show();
			$('#fo-dot-current').attr({ cx: cx, cy: cy_val }).show();
			$('#fo-dot-prior').attr({ cx: cx, cy: py_val }).show();

			$('.fo-axis-label[id^="fo-month-label-"]').removeClass('fo-axis-label-active');
			$(`#fo-month-label-${idx}`).addClass('fo-axis-label-active');

			const sign = p.change_pct >= 0 ? '+' : '';
			const html = `
				<div class="fo-trend-tip-header">${this.icon('calendar')} ${p.month} ${this.data.fiscal_year}</div>
				<div class="fo-trend-tip-row">
					<span class="fo-dot" style="background:#1c6b4a"></span> ${__('Current Year')}
					<b>$${p.value.toFixed(1)}M</b>
				</div>
				<div class="fo-trend-tip-row">
					<span class="fo-dot fo-dot-hollow" style="border-color:#8fc9a9"></span> ${__('Prior Year')}
					<b>$${p.prior.toFixed(1)}M</b>
				</div>
				<div class="fo-trend-tip-yoy">
					<span class="${p.change_pct >= 0 ? 'fo-yoy-up' : 'fo-yoy-down'}">
						${p.change_pct >= 0 ? '&#8599;' : '&#8600;'} ${sign}${p.change_pct}%
					</span>
					<span class="fo-trend-tip-amount">(${p.change_amount_fmt})</span>
				</div>
			`;

			// position tooltip in page coordinates, above the point
			const svg_rect = $svg_el.getBoundingClientRect();
			const scale_x = svg_rect.width / W;
			const scale_y = svg_rect.height / H;
			const screen_x = svg_rect.left + cx * scale_x - page_offset.left - $(window).scrollLeft();
			const screen_y = svg_rect.top + cy_val * scale_y - page_offset.top - $(window).scrollTop();

			this.show_tooltip(html, screen_x, screen_y - 10, 'fo-tooltip-trend');
		}).on('mouseleave', () => {
			$('#fo-crosshair, #fo-dot-current, #fo-dot-prior').hide();
			$('.fo-axis-label[id^="fo-month-label-"]').removeClass('fo-axis-label-active');
			this.hide_tooltip();
		});
	}

	/* ---------------------------------------------------------
	 *  Styles
	 * --------------------------------------------------------- */
	inject_styles() {
		if (document.getElementById('financial-overview-styles')) return;
		const style = document.createElement('style');
		style.id = 'financial-overview-styles';
		style.innerHTML = `
			.fo-page {
				background: #f7f4ef;
				padding: 24px;
				font-family: var(--font-stack, 'Inter', sans-serif);
				color: #1a1a1a;
				position: relative;
			}
			.fo-loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; gap: 12px; }
			.fo-spinner { width: 34px; height: 34px; border: 3px solid #dcece3; border-top-color: #1c6b4a; border-radius: 50%; animation: fo-spin 0.8s linear infinite; }
			@keyframes fo-spin { to { transform: rotate(360deg); } }
			.fo-loading-text { color: #777; font-size: 13px; }

			.fo-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
			.fo-title { font-size: 34px; font-weight: 800; margin: 0; }
			.fo-title-accent { color: #1c6b4a; font-weight: 700; }
			.fo-subtitle { color: #666; font-size: 14px; margin-top: 4px; }
			.fo-note { color: #999; font-size: 12px; padding-top: 6px; }

			.fo-stats-row { display: grid; grid-template-columns: 1.5fr 4fr; gap: 16px; margin-bottom: 16px; }

			.fo-hero-card {
				background: linear-gradient(160deg, #1f7050 0%, #123d2c 100%);
				border-radius: 16px; padding: 22px; color: #fff; position: relative; overflow: hidden;
				min-height: 340px; display: flex; flex-direction: column;
			}
			.fo-hero-top { display: flex; justify-content: space-between; align-items: center; }
			.fo-hero-label { display: flex; align-items: center; gap: 8px; font-size: 14px; opacity: 0.9; }
			.fo-hero-label svg { width: 16px; height: 16px; }
			.fo-badge { border-radius: 20px; padding: 4px 10px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
			.fo-badge-hero { background: rgba(255,255,255,0.15); color: #fff; }
			.fo-badge-up { background: #eaf7ef; color: #1c6b4a; border: 1px solid #cdeadb; }
			.fo-badge-down { background: #fdece3; color: #c1602f; border: 1px solid #f6d3bf; }
			.fo-hero-value { font-size: 40px; font-weight: 800; margin-top: 14px; }
			.fo-hero-divider { border-top: 1px solid rgba(255,255,255,0.2); margin: 16px 0 12px; }
			.fo-hero-metrics { display: flex; gap: 26px; }
			.fo-hero-metric-label { font-size: 11px; opacity: 0.75; margin-bottom: 6px; }
			.fo-hero-metric-value { font-size: 15px; font-weight: 700; }
			.fo-hero-metric-badge { background: rgba(255,255,255,0.15); border-radius: 6px; padding: 3px 8px; font-size: 13px; font-weight: 700; }
			.fo-hero-legend { margin-top: auto; display: flex; gap: 16px; font-size: 12px; opacity: 0.85; padding-top: 18px; }
			.fo-line-swatch { display: inline-block; width: 14px; height: 2px; margin-right: 5px; vertical-align: middle; }
			.fo-line-2025 { background: #fff; }
			.fo-line-2024 { background: rgba(255,255,255,0.5); }
			.fo-hero-spark { width: 100%; height: 50px; margin-top: 6px; }

			.fo-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
			.fo-card { background: #fff; border-radius: 16px; padding: 18px; border: 1px solid #ececec; display: flex; flex-direction: column; }
			.fo-card-top { display: flex; justify-content: space-between; align-items: center; }
			.fo-icon { color: #1c6b4a; }
			.fo-icon svg { width: 20px; height: 20px; }
			.fo-card-label { color: #666; font-size: 13px; margin-top: 10px; }
			.fo-card-value { font-size: 26px; font-weight: 800; margin-top: 4px; }
			.fo-card-vs { color: #999; font-size: 12px; margin: 4px 0 10px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
			.fo-bars { display: flex; align-items: flex-end; gap: 8px; height: 70px; margin-top: auto; }
			.fo-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; cursor: pointer; }
			.fo-bar { width: 100%; max-width: 26px; background: #1c6b4a; border-radius: 3px 3px 0 0; transition: opacity 0.15s; }
			.fo-bar-col:hover .fo-bar { opacity: 0.75; }
			.fo-bar-orange { background: #d9824f; }
			.fo-bar-label { font-size: 10px; color: #aaa; margin-top: 5px; }

			.fo-panels-row { display: grid; grid-template-columns: 1fr 1.7fr; gap: 16px; }
			.fo-panel { background: #fff; border-radius: 16px; padding: 22px; border: 1px solid #ececec; }
			.fo-panel-title { font-weight: 700; font-size: 16px; margin-bottom: 20px; }

			.fo-breakdown-body { display: flex; flex-direction: column; align-items: center; gap: 30px; }
			.fo-legend { width: 100%; display: flex; flex-direction: column; gap: 18px; }
			.fo-legend-row { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 4px; border-radius: 8px; transition: background 0.15s; }
			.fo-legend-row:hover { background: #f5f7f6; }
			.fo-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
			.fo-dot-hollow { background: #fff !important; border: 2px solid; }
			.fo-legend-label { font-size: 13px; font-weight: 600; }
			.fo-legend-value { font-size: 12px; color: #777; }
			.fo-legend-pct { color: #aaa; }

			.fo-donut-wrap { position: relative; width: 200px; height: 200px; }
			.fo-donut-svg { width: 200px; height: 200px; overflow: visible; }
			.fo-donut-slice { cursor: pointer; transition: opacity 0.15s, transform 0.15s; transform-origin: 100px 100px; }
			.fo-donut-slice-active { transform: scale(1.035); }
			.fo-donut-slice-dim { opacity: 0.45; }
			.fo-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
			.fo-donut-total-label { font-size: 12px; color: #888; }
			.fo-donut-total-value { font-size: 20px; font-weight: 800; }

			.fo-trend-chart-wrap { position: relative; }
			.fo-trend-svg { width: 100%; height: 360px; }
			.fo-axis-label { font-size: 11px; fill: #999; font-family: inherit; }
			.fo-axis-label-active { fill: #1a1a1a; font-weight: 700; }
			#fo-trend-overlay { cursor: crosshair; }
			.fo-trend-legend { display: flex; justify-content: flex-end; gap: 16px; font-size: 12px; color: #666; margin-top: -8px; }

			/* --- shared floating tooltip --- */
			.fo-tooltip {
				position: absolute; z-index: 50; background: #fff; border-radius: 10px;
				box-shadow: 0 8px 24px rgba(0,0,0,0.14); padding: 10px 14px; font-size: 12px;
				pointer-events: none; opacity: 0; transform: translateY(4px);
				transition: opacity 0.12s, transform 0.12s; white-space: nowrap;
			}
			.fo-tooltip-visible { opacity: 1; transform: translateY(0); }

			.fo-tooltip-bar { transform: translate(-50%, -100%); font-weight: 600; color: #1a1a1a; }

			.fo-tooltip-donut { width: 220px; white-space: normal; transform: translateY(-50%); }
			.fo-popup-header { display: flex; align-items: center; gap: 8px; font-size: 14px; margin-bottom: 6px; }
			.fo-popup-total-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
			.fo-popup-total-value { font-size: 20px; font-weight: 800; }
			.fo-popup-total-pct { color: #1c6b4a; font-weight: 700; font-size: 13px; }
			.fo-popup-sub-heading { font-size: 10px; letter-spacing: 0.05em; color: #aaa; margin-bottom: 8px; }
			.fo-popup-sub-row { margin-bottom: 8px; }
			.fo-popup-sub-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
			.fo-popup-sub-value { font-weight: 700; }
			.fo-popup-sub-track { height: 4px; background: #eee; border-radius: 4px; overflow: hidden; }
			.fo-popup-sub-fill { height: 100%; border-radius: 4px; }
			.fo-popup-sub-empty { font-size: 12px; color: #999; }

			.fo-tooltip-trend { background: #1c6b4a; color: #fff; transform: translate(-50%, -100%); }
			.fo-trend-tip-header { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; margin-bottom: 8px; }
			.fo-trend-tip-header svg { width: 13px; height: 13px; }
			.fo-trend-tip-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 4px; opacity: 0.9; }
			.fo-trend-tip-row b { margin-left: auto; }
			.fo-trend-tip-yoy { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.25); display: flex; gap: 8px; align-items: center; font-size: 12px; }
			.fo-yoy-up { color: #a9e8c4; font-weight: 700; }
			.fo-yoy-down { color: #f6c2a4; font-weight: 700; }
			.fo-trend-tip-amount { opacity: 0.8; }

			@media (max-width: 1100px) {
				.fo-stats-row, .fo-panels-row { grid-template-columns: 1fr; }
				.fo-stats-grid { grid-template-columns: repeat(2, 1fr); }
			}
		`;
		document.head.appendChild(style);
	}
}