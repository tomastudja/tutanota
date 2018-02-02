// @flow
import m from "mithril"
import {Dialog} from "../gui/base/Dialog"
import {Button, ButtonType, createDropDownButton} from "../gui/base/Button"
import {TextField} from "../gui/base/TextField"
import {DialogHeaderBar} from "../gui/base/DialogHeaderBar"
import {lang, languages} from "../misc/LanguageViewModel"
import {GroupType, BookingItemFeatureType} from "../api/common/TutanotaConstants"
import {load, loadAll, update, setup} from "../api/main/Entity"
import {neverNull, getGroupInfoDisplayName, compareGroupInfos} from "../api/common/utils/Utils"
import {assertMainOrNode} from "../api/Env"
import {windowFacade} from "../misc/WindowFacade"
import {logins} from "../api/main/LoginController"
import {CustomerTypeRef} from "../api/entities/sys/Customer"
import {GroupInfoTypeRef} from "../api/entities/sys/GroupInfo"
import {DropDownSelector} from "../gui/base/DropDownSelector"
import {GroupTypeRef} from "../api/entities/sys/Group"
import {isSameId, stringToCustomId} from "../api/common/EntityFunctions"
import {Table, ColumnWidth} from "../gui/base/Table"
import TableLine from "../gui/base/TableLine"
import {createContactForm, ContactFormTypeRef} from "../api/entities/tutanota/ContactForm"
import {remove, mapAndFilterNull} from "../api/common/utils/ArrayUtils"
import {statisticsFieldTypeToString, getContactFormUrl} from "./ContactFormViewer"
import * as AddStatisticsFieldDialog from "./AddStatisticsFieldDialog"
import {HtmlEditor} from "../gui/base/HtmlEditor"
import {Icons} from "../gui/base/icons/Icons"
import {CustomerContactFormGroupRootTypeRef} from "../api/entities/tutanota/CustomerContactFormGroupRoot"
import {NotFoundError} from "../api/common/error/RestError"
import {MailboxGroupRootTypeRef} from "../api/entities/tutanota/MailboxGroupRoot"
import {UserTypeRef} from "../api/entities/sys/User"
import {showProgressDialog} from "../gui/base/ProgressDialog"
import stream from "mithril/stream/stream.js"
import {createContactFormLanguage} from "../api/entities/tutanota/ContactFormLanguage"
import {DefaultAnimationTime} from "../gui/animation/Animations"
import {getDefaultContactFormLanguage, getAdministratedGroupIds} from "../contacts/ContactFormUtils"
import * as BuyDialog from "./BuyDialog"
import {BootIcons} from "../gui/base/icons/BootIcons"

assertMainOrNode()

// keep in sync with ContactFormAccessor.java
let PATH_PATTERN = /^[a-zA-Z0-9_\\-]+$/

export class ContactFormEditor {
	_createNew: boolean;
	_contactForm: ContactForm;
	_newContactFormIdReceiver: Function

	dialog: Dialog;
	view: Function;

	_pageTitleField: TextField;
	_pathField: TextField;
	_receivingMailboxField: TextField;
	_receivingMailbox: stream<GroupInfo>;
	_participantGroupInfoList: GroupInfo[];
	_participantGroupInfosTable: Table;
	_headerField: HtmlEditor;
	_footerField: HtmlEditor;
	_helpField: HtmlEditor;
	_statisticsFields: InputField[];
	_statisticsFieldsTable: Table;
	_language: stream<ContactFormLanguage>;
	_languages: ContactFormLanguage[];
	_languageField: TextField;

	/**
	 * This constructor is only used internally. See show() for the external interface.
	 */
	constructor(c: ?ContactForm, createNew: boolean, newContactFormIdReceiver: Function, allUserGroupInfos: GroupInfo[], allSharedMailboxGroupInfos: GroupInfo[], brandingDomain: string) {
		this._createNew = createNew
		this._contactForm = c ? c : createContactForm()
		this._newContactFormIdReceiver = newContactFormIdReceiver
		if (!logins.getUserController().isGlobalAdmin()) {
			let localAdminGroupIds = logins.getUserController().getLocalAdminGroupMemberships().map(gm => gm.group)
			allSharedMailboxGroupInfos = allSharedMailboxGroupInfos.filter(gi => localAdminGroupIds.indexOf(gi.localAdmin) != -1)
			allUserGroupInfos = allUserGroupInfos.filter(gi => localAdminGroupIds.indexOf(gi.localAdmin) != -1)
		}
		allSharedMailboxGroupInfos.sort(compareGroupInfos)
		allUserGroupInfos.sort(compareGroupInfos)

		let selectedTargetGroupInfo = allSharedMailboxGroupInfos.length > 0 ? allSharedMailboxGroupInfos[0] : (allUserGroupInfos.length > 0 ? allUserGroupInfos[0] : null)
		if (this._contactForm.targetGroupInfo) {
			let groupInfo = allSharedMailboxGroupInfos.find(groupInfo => isSameId(neverNull(this._contactForm.targetGroupInfo), groupInfo._id))
			if (!groupInfo) {
				groupInfo = allUserGroupInfos.find(groupInfo => isSameId(neverNull(this._contactForm.targetGroupInfo), groupInfo._id))
			}
			if (groupInfo) {
				selectedTargetGroupInfo = groupInfo
			}
		}

		this._receivingMailboxField = new TextField("receivingMailbox_label").setDisabled()
		this._receivingMailbox = stream(selectedTargetGroupInfo)
		this._receivingMailbox.map(groupInfo => {
			let prefix = (groupInfo.groupType == GroupType.User ? lang.get("account_label") : lang.get("sharedMailbox_label")) + ": "
			this._receivingMailboxField.value(prefix + getGroupInfoDisplayName(groupInfo))
		})
		let userDropdown = createDropDownButton("account_label", () => BootIcons.Contacts, () => {
			return allUserGroupInfos.map(gi => new Button(() => getGroupInfoDisplayName(gi), () => this._receivingMailbox(gi))
				.setType(ButtonType.Dropdown)
				.setSelected(() => this._receivingMailbox() === gi))
		}, 250)
		let groupsDropdown = createDropDownButton("groups_label", () => Icons.People, () => {
			return allSharedMailboxGroupInfos.map(gi => new Button(() => getGroupInfoDisplayName(gi), () => this._receivingMailbox(gi))
				.setType(ButtonType.Dropdown)
				.setSelected(() => this._receivingMailbox() === gi))
		}, 250)
		this._receivingMailboxField._injectionsRight = () => [m(userDropdown), m(groupsDropdown)]

		// remove all groups that do not exist any more
		this._participantGroupInfoList = mapAndFilterNull(this._contactForm.participantGroupInfos, groupInfoId => allUserGroupInfos.find(g => isSameId(g._id, groupInfoId)))
		let addParticipantMailGroupButton = new Button("addResponsiblePerson_label", () => {
			let availableGroupInfos = allUserGroupInfos.filter(g => this._participantGroupInfoList.find(alreadyAdded => isSameId(alreadyAdded._id, g._id)) == null)
			if (availableGroupInfos.length > 0) {
				let d = new DropDownSelector("group_label", null, availableGroupInfos.map(g => {
					return {name: getGroupInfoDisplayName(g), value: g}
				}), availableGroupInfos[0], 250)
				return Dialog.smallDialog(lang.get("addResponsiblePerson_label"), {
					view: () => m(d)
				}, null).then(ok => {
					if (ok) {
						this._participantGroupInfoList.push(d.selectedValue())
						this._updateParticipantGroupInfosTable()
					}
				})
			}
		}, () => Icons.Add)
		this._participantGroupInfosTable = new Table(["responsiblePersons_label"], [ColumnWidth.Largest], true, addParticipantMailGroupButton)
		this._updateParticipantGroupInfosTable()

		this._pathField = new TextField("urlPath_label", () => getContactFormUrl(brandingDomain, this._pathField.value())).setValue(this._contactForm.path)

		this._languages = this._contactForm.languages.map(l => Object.assign({}, l))
		if (this._languages.length == 0) {
			let l = createContactFormLanguage()
			l.code = lang.code
			this._languages.push(l)
		}
		let previousLanguage: ?ContactFormLanguage = null
		let language = getDefaultContactFormLanguage(this._languages)
		this._language = stream(language)
		this._languageField = new TextField("language_label").setDisabled()
		let selectLanguageButton = createDropDownButton("more_label", () => Icons.More, () => {
			let buttons = this._languages.map(l => new Button(() => getLanguageName(l.code), e => this._language(l)).setType(ButtonType.Dropdown)).sort((a, b) => a.getLabel().localeCompare(b.getLabel()))
			buttons.push(new Button("addLanguage_action", e => {
				let allLanguages = languages.filter(t => this._languages.find(l => l.code == t.code) == null).map(l => {
					return {name: lang.get(l.textId), value: l.code}
				}).sort((a, b) => a.name.localeCompare(b.name))
				let newLanguageCode = stream(allLanguages[0].value)
				let tagName = new DropDownSelector("addLanguage_action", null, allLanguages, newLanguageCode, 250)

				setTimeout(() => {
					Dialog.smallDialog(lang.get("addLanguage_action"), {
						view: () => m(tagName)
					}).then(ok => {
						if (ok) {
							let newLang = createContactFormLanguage()
							newLang.code = newLanguageCode()
							this._languages.push(newLang)
							this._language(newLang)
						}
					})
				}, DefaultAnimationTime)// wait till the dropdown is hidden
			}).setType(ButtonType.Dropdown))
			return buttons
		}, 250)
		let deleteLanguageButton = new Button('delete_action', () => {
			remove(this._languages, this._language())
			this._language(this._languages[0])
		}, () => Icons.Cancel)
		this._languageField._injectionsRight = () => [
			m(selectLanguageButton),
			this._languages.length > 1 ? m(deleteLanguageButton) : null
		]

		this._pageTitleField = new TextField("pageTitle_label")

		this._headerField = new HtmlEditor().setModeSwitcher("header_label").setMinHeight(200).showBorders()
		this._footerField = new HtmlEditor().setModeSwitcher("footer_label").setMinHeight(200).showBorders()
		this._helpField = new HtmlEditor().setModeSwitcher("helpPage_label").setMinHeight(200).showBorders()

		let addStatisticsFieldButton = new Button("addStatisticsField_action", () => AddStatisticsFieldDialog.show().then(inputField => {
			if (inputField) {
				this._statisticsFields.push(inputField)
				this._updateStatisticsFieldTable()
			}
		}), () => Icons.Add)
		this._statisticsFieldsTable = new Table(["name_label", "type_label"], [ColumnWidth.Largest, ColumnWidth.Largest], true, addStatisticsFieldButton)

		this._language.map((l: ContactFormLanguage) => {
			if (previousLanguage && l != previousLanguage) {
				this.updateLanguageFromFields(previousLanguage)
			}
			previousLanguage = l
			this._languageField.setValue(getLanguageName(l.code))
			this._pageTitleField.setValue(l.pageTitle)
			this._headerField.setValue(l.headerHtml)
			this._footerField.setValue(l.footerHtml)
			this._helpField.setValue(l.helpHtml)
			this._statisticsFields = l.statisticsFields.slice()
			this._updateStatisticsFieldTable()
		})


		let headerBar = new DialogHeaderBar()
			.addLeft(new Button('cancel_action', () => this._close()).setType(ButtonType.Secondary))
			.setMiddle(() => lang.get(this._createNew ? "createContactForm_label" : "editContactForm_label"))
			.addRight(new Button('save_action', () => this._save()).setType(ButtonType.Primary))
		this.view = () => m("#contact-editor.pb", [
			m(".h4.mt-l", lang.get("emailProcessing_label")),
			m(this._receivingMailboxField),
			this._receivingMailbox().groupType == GroupType.User ? null : m(".mt-l", [
					m(this._participantGroupInfosTable),
					m(".small", lang.get("responsiblePersonsInfo_msg"))
				]),
			m(".h4.mt-l", lang.get("display_action")),
			m(this._pathField),
			m(this._languageField),
			m(this._pageTitleField),
			m(this._headerField),
			m(this._footerField),
			m(this._helpField),
			m(".h4.mt-l", lang.get("statisticsFields_label")),
			m(this._statisticsFieldsTable)
		])
		this.dialog = Dialog.largeDialog(headerBar, this)
	}

	updateLanguageFromFields(language: ContactFormLanguage) {
		language.pageTitle = this._pageTitleField.value()
		language.headerHtml = this._headerField.getValue()
		language.footerHtml = this._footerField.getValue()
		language.helpHtml = this._helpField.getValue()
		language.statisticsFields = this._statisticsFields
	}

	_updateStatisticsFieldTable() {
		this._statisticsFieldsTable.updateEntries(this._statisticsFields.map(field => {
			let removeButton = new Button("removeStatisticsField_action", () => {
				remove(this._statisticsFields, field)
				this._updateStatisticsFieldTable()
			}, () => Icons.Cancel)
			return new TableLine([field.name, statisticsFieldTypeToString(field)], removeButton)
		}))
	}

	_updateParticipantGroupInfosTable() {
		this._participantGroupInfosTable.updateEntries(this._participantGroupInfoList.map(groupInfo => {
			let removeButton = new Button("removeGroup_action", () => {
				remove(this._participantGroupInfoList, groupInfo)
				this._updateParticipantGroupInfosTable()
			}, () => Icons.Cancel)
			return new TableLine([getGroupInfoDisplayName(groupInfo)], removeButton)
		}))
	}

	_close() {
		windowFacade.checkWindowClosing(false)
		this.dialog.close()
	}

	_save() {
		if (!PATH_PATTERN.test(this._pathField.value())) {
			Dialog.error("pleaseEnterValidPath_msg")
		} else {
			// check that the path is unique
			showProgressDialog("pleaseWait_msg", load(CustomerTypeRef, neverNull(logins.getUserController().user.customer)).then(customer => {
					return load(CustomerContactFormGroupRootTypeRef, customer.customerGroup).then(root => {
						if (!this._receivingMailbox()) {
							return Dialog.error("noReceivingMailbox_label")
						}
						let contactFormsListId = root.contactForms
						let customElementIdFromPath = stringToCustomId(this._pathField.value())
						let contactFormIdFromPath = [contactFormsListId, customElementIdFromPath]
						let samePathFormCheck = Promise.resolve(false)
						// only compare the path if this is a new contact form or it is a different existing contact form
						if (!this._contactForm._id || !isSameId(this._contactForm._id, contactFormIdFromPath)) {
							samePathFormCheck = load(ContactFormTypeRef, contactFormIdFromPath).then(cf => true).catch(NotFoundError, e => false)
						}
						return samePathFormCheck.then(samePathForm => {
							if (samePathForm) {
								return Dialog.error("pathAlreadyExists_msg")
							} else {
								// check if the target mail group is already referenced by a different contact form
								return load(GroupTypeRef, this._receivingMailbox().group).then(group => {
									if (group.user) {
										return load(UserTypeRef, group.user).then(user => {
											return neverNull(user.memberships.find(m => m.groupType == GroupType.Mail)).group
										})
									} else {
										return group._id
									}
								}).then(mailGroupId => {
									return load(MailboxGroupRootTypeRef, mailGroupId).then(mailboxGroupRoot => {
										let contactFormIdToCheck = (this._createNew) ? contactFormIdFromPath : this._contactForm._id
										if (mailboxGroupRoot.targetMailGroupContactForm && !isSameId(mailboxGroupRoot.targetMailGroupContactForm, contactFormIdToCheck)) {
											return Dialog.error("receivingMailboxAlreadyUsed_msg")
										} else {
											this._contactForm._ownerGroup = neverNull(logins.getUserController().user.memberships.find(m => m.groupType === GroupType.Customer)).group
											this._contactForm.targetGroup = this._receivingMailbox().group
											this._contactForm.targetGroupInfo = this._receivingMailbox()._id
											this._contactForm.participantGroupInfos = this._participantGroupInfoList.map(groupInfo => groupInfo._id)
											this._contactForm.path = this._pathField.value()
											this.updateLanguageFromFields(this._language())
											this._contactForm.languages = this._languages

											let p
											if (this._createNew) {
												this._contactForm._id = contactFormIdFromPath
												p = BuyDialog.show(BookingItemFeatureType.ContactForm, 1, 0, false).then(accepted => {
													if (accepted) {
														return setup(contactFormsListId, this._contactForm).then(contactFormId => {
															this._newContactFormIdReceiver(customElementIdFromPath)
														})
													}
												})
											} else {
												p = update(this._contactForm).then(() => {
													this._newContactFormIdReceiver(customElementIdFromPath)
												})
											}
											return p.then(() => this._close())
										}
									})
								})
							}
						})
					})
				}
			))
		}
	}
}

/**
 * @param createNew If true creates a new contact form. if c is provided it is taken as template for the new form.
 * @param newContactFormIdReceiver. Is called receiving the contact id as soon as the new contact was saved.
 */
export function show(c: ?ContactForm, createNew: boolean, brandingDomain: string, newContactFormIdReceiver: Function) {
	showProgressDialog("loading_msg", load(CustomerTypeRef, neverNull(logins.getUserController().user.customer)).then(customer => {
		// collect all enabled user mail groups together with the users name and the users mail address
		return loadAll(GroupInfoTypeRef, customer.userGroups).filter(g => !g.deleted).then(userGroupInfos => {
			let globalAdmin = logins.getUserController().isGlobalAdmin()
			return getAdministratedGroupIds().then(adminGroupIds => {
				// get and separate all enabled shared mail groups and shared team groups
				return loadAll(GroupInfoTypeRef, customer.teamGroups)
					.filter(g => !g.deleted)
					.filter(teamGroupInfo => teamGroupInfo.groupType == GroupType.Mail).then(sharedMailGroupInfos => {
						let editor = new ContactFormEditor(c, createNew, newContactFormIdReceiver, userGroupInfos, sharedMailGroupInfos, brandingDomain)
						editor.dialog.show()
						windowFacade.checkWindowClosing(true)
					})
			})
		})
	}))
}

function getLanguageName(code: string): string {
	return lang.get(neverNull(languages.find(t => t.code == code)).textId)
}