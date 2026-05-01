frappe.provide("frappe.listview_settings");

console.log("Opportunity List script loaded.");

frappe.listview_settings['Opportunity'] = {
	add_fields: ["expected_closing", "status"],
	refresh: function (listview) {
		console.log("Opportunity listview refresh triggered. View:", listview.view_name);
		if (listview.view_name === 'Kanban') {
			console.log("Setting up Kanban color observer.");
			setup_kanban_color_observer(listview);
		}
	}
};

function setup_kanban_color_observer(listview) {
	const targetNode = document.querySelector('.kanban-container');
	if (!targetNode) {
		setTimeout(() => setup_kanban_color_observer(listview), 200);
		return;
	}

	apply_kanban_colors(listview);

	const observer = new MutationObserver((mutationsList) => {
		apply_kanban_colors(listview);
	});

	observer.observe(targetNode, { childList: true, subtree: true });

	$(document).on('route-change', () => {
		observer.disconnect();
	});
}

function apply_kanban_colors(listview) {
	if (!listview || !listview.data) {
		console.log("No listview data found to apply colors.");
		return;
	}

	const today = frappe.datetime.get_today();
	const next_7_days = frappe.datetime.add_days(today, 7);
	console.log(`Applying colors for ${listview.data.length} docs. Today: ${today}, Next 7: ${next_7_days}`);

	listview.data.forEach(doc => {
		const safe_name = doc.name.replace(/'/g, "\\'");
		const $card = $(`.kanban-card[data-name='${safe_name}']`);

		if (!$card.length) {
			// Log occasionally or for specific cases if needed, but not for every missing card to avoid spam
			return;
		}

		let bgColor = '';

		if (doc.status === "Closed Won" || doc.status === "Lost" || doc.status === "Closed Lost") {
			bgColor = '';
		} else if (doc.expected_closing) {
			if (doc.expected_closing < today) {
				bgColor = '#ffebee';
			} else if (doc.expected_closing >= today && doc.expected_closing <= next_7_days) {
				bgColor = '#fff9c4';
			}
		}

		console.log(`Doc: ${doc.name}, Status: ${doc.status}, Date: ${doc.expected_closing}, Target Color: ${bgColor || 'Default'}`);

		if (bgColor) {
			$card.attr('style', `background-color: ${bgColor} !important`);
			$card.find('.kanban-card-body').attr('style', `background-color: ${bgColor} !important`);
		} else {
			$card.removeAttr('style');
			$card.find('.kanban-card-body').removeAttr('style');
		}
	});
}
