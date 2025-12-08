frappe.ui.form.on('Opportunity', {
    refresh: function(frm) {
        function toggle_project_button() {
            if (frm.doc.status === 'Closed Won' && !frm.doc.custom_created_project && (frappe.user.has_role('Employee') || frappe.user.has_role('System Manager'))) {
                frm.add_custom_button(__('Create Project'), function() {
                    
                    // 1. Create a dialog to ask for the Project Template.
                    let dialog = new frappe.ui.Dialog({
                        title: 'Select Project Template',
                        fields: [
                            {
                                label: 'Project Template',
                                fieldname: 'project_template',
                                fieldtype: 'Link',
                                options: 'Project Template',
                                reqd: 1 // Make the selection mandatory
                            }
                        ],
                        primary_action_label: 'Create Project',
                        // 2. This code runs when the user clicks "Create Project".
                        primary_action: function(values) {
                            // Change the dialog to show a progress bar.
                            dialog.get_primary_btn().prop('disabled', true).html('Queuing...');
                            dialog.body.innerHTML = `
                                <div class="progress">
                                    <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
                                </div>
                                <div class="text-center" style="margin-top: 10px;">
                                    Adding job to the queue...
                                </div>`;

                            // 3. Call the backend with the selected template.
                            frappe.call({
                                method: 'crm_enhancements.crm_enhancements.api.enqueue_project_creation',
                                args: {
                                    opportunity_name: frm.doc.name,
                                    user: frappe.session.user,
                                    project_template: values.project_template // Pass the selected template
                                },
                                callback: function(r) {
                                    dialog.hide(); // Close the dialog.
                                    if (r.message && r.message.status === 'queued') {
                                        frappe.show_alert({
                                            message: __('Project creation started in the background. Awaiting completion...'),
                                            indicator: 'blue'
                                        });
                                        frm.remove_custom_button('Create Project');
                                    }
                                }
                            });
                        }
                    });

                    dialog.show();

                }).addClass('btn-primary');
            } else {
                frm.remove_custom_button('Create Project');
            }
        }
        toggle_project_button();
        frm.fields_dict['status'].$input.on('change', toggle_project_button);

        // The real-time listener for completion remains exactly the same.
        frappe.realtime.on('project_creation_status', function(data) {
            if (data.opportunity_name === frm.doc.name) {
                if (data.status === 'success') {
                    frappe.show_alert({
                        message: __(`Project <a href="/app/project/${data.project_doc.name}">${data.project_doc.name}</a> created successfully.`),
                        indicator: 'green'
                    }, 10);
                    frm.reload_doc();
                } else {
                    frappe.show_alert({
                        message: __('Project creation failed. Please check the Error Log for details.'),
                        indicator: 'red'
                    }, 10);
                }
            }
        });
    }
});
