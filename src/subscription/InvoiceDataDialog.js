// @flow
import m from "mithril"
import {Dialog} from "../gui/base/Dialog"
import {lang} from "../misc/LanguageViewModel"
import {InvoiceDataInput} from "./InvoiceDataInput"
import {updatePaymentData} from "./InvoiceAndPaymentDataPage"

export function show(subscriptionOptions: SubscriptionOptions, invoiceData: InvoiceData): Dialog {

	const invoiceDataInput = new InvoiceDataInput(subscriptionOptions, invoiceData)

	const confirmAction = () => {
		let error = invoiceDataInput.validateInvoiceData()
		if (error) {
			Dialog.error(error)
		} else {
			updatePaymentData(subscriptionOptions, invoiceDataInput.getInvoiceData(), null, null).then(success => {
				if (success) {
					dialog.close()
				}
			})
		}
	}

	const dialog = Dialog.smallActionDialog(lang.get("invoiceData_msg"), {
		view: () => m("#changeInvoiceDataDialog", [
			m(invoiceDataInput),
		])
	}, confirmAction, true, "save_action")
	return dialog
}