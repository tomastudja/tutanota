// @flow
import {inputLineHeight, Type} from "../gui/base/TextField"
import m from "mithril"
import {Icons} from "../gui/base/icons/Icons"
import {logins} from "../api/main/LoginController"
import {styles} from "../gui/styles"
import {px, size} from "../gui/size"
import stream from "mithril/stream/stream.js"
import {theme} from "../gui/theme"
import {Icon} from "../gui/base/Icon"
import {DefaultAnimationTime} from "../gui/animation/Animations"
import {BootIcons} from "../gui/base/icons/BootIcons"
import {displayOverlay, closeOverlay} from "../gui/base/Overlay"
import {NavButton} from "../gui/base/NavButton"
import {Dropdown} from "../gui/base/Dropdown"
import {MailTypeRef} from "../api/entities/tutanota/Mail"
import {ContactTypeRef} from "../api/entities/tutanota/Contact"
import {load} from "../api/main/Entity"
import {keyManager, Keys} from "../misc/KeyManager"
import {formatDateTimeFromYesterdayOn, formatDateWithWeekday} from "../misc/Formatter"
import {getSenderOrRecipientHeading} from "../mail/MailUtils"
import {isSameTypeRef} from "../api/common/EntityFunctions"
import {mod} from "../misc/MathUtils"
import type {RouteChangeEvent} from "../misc/RouteChange"
import {routeChange} from "../misc/RouteChange"
import {lang} from "../misc/LanguageViewModel"
import {NotFoundError, NotAuthorizedError} from "../api/common/error/RestError"
import {setSearchUrl, getRestriction, getSearchUrl} from "./SearchUtils"
import {locator} from "../api/main/MainLocator"
import {Dialog} from "../gui/base/Dialog"
import {worker} from "../api/main/WorkerClient"
import {GroupInfoTypeRef} from "../api/entities/sys/GroupInfo"
import {FULL_INDEXED_TIMESTAMP} from "../api/common/TutanotaConstants"
import {Button} from "../gui/base/Button"
import {assertMainOrNode} from "../api/Env"
import {compareContacts} from "../contacts/ContactUtils"

assertMainOrNode()

type ShowMoreAction = {
	resultCount:number,
	shownCount:number,
	indexTimestamp:number,
	allowShowMore:boolean
}

export class SearchBar {
	view: Function;
	_domInput: HTMLInputElement;
	_domWrapper: HTMLElement;
	value: stream<string>;
	focused: boolean;
	expanded: boolean;
	dropdown: Dropdown;
	skipNextBlur: boolean;
	_results: Array<Mail|Contact|GroupInfo|ShowMoreAction>;
	oncreate: Function;
	onbeforeremove: Function;
	busy: boolean;
	_selected: ?Mail|Contact|GroupInfo|ShowMoreAction;
	_groupInfoRestrictionListId: ?Id;
	lastSelectedGroupInfoResult: stream<GroupInfo>;

	constructor() {
		this._groupInfoRestrictionListId = null
		this.lastSelectedGroupInfoResult = stream()
		this.expanded = false
		this.focused = false
		this.skipNextBlur = false
		this.busy = false
		this.value = stream("")
		this.value.map(v => {
			if (v) {
				this.expanded = true
			}
		})
		let b = new NavButton('search_label', () => BootIcons.Mail, () => "/search", "/search")
		this.dropdown = new Dropdown(() => [b], 250)
		this._results = []
		this.view = (): VirtualElement => {
			return m("", {
				style: {
					display: this.isVisible() ? "flex" : 'none'
				}
			}, [
				m(".search-bar.flex-end.items-center", {
					oncreate: (vnode) => {
						this._domWrapper = vnode.dom
					},
					style: {
						'min-height': px(inputLineHeight + 2), // 2 px border
						'padding-bottom': this.expanded ? (this.focused ? px(0) : px(1)) : px(2),
						'padding-top': px(2), // center input field
						'margin-right': px(15),
						'border-bottom': this.expanded ? (this.focused ? `2px solid ${theme.content_accent}` : `1px solid ${theme.content_border}`) : "0px",
						'align-self': "center"
					}
				}, [
					m(".ml-negative-xs.click", {
						onmousedown: e => {
							if (this.focused) {
								this.skipNextBlur = true
							}
						},
						onclick: (e) => {
							this.handleSearchClick(e)
						}
					}, m(Icon, {
						icon: Icons.Search,
						class: "flex-center items-center icon-large",
						style: {
							fill: this.focused ? theme.header_button_selected : theme.header_button,
							//"margin-top": (this._hideLabel) ? "0px" : "-2px"
						}
					})),
					m(".searchInputWrapper.flex-end.items-center", {
						style: {
							"width": this.expanded ? px(200) : px(0),
							"transition": `width ${DefaultAnimationTime}ms`,
							'padding-left': this.expanded ? '10px' : '0px',
							'padding-top': '3px',
							'padding-bottom': '3px',
							'overflow-x': 'hidden'
						}

					}, [this._getInputField(), m(".closeIconWrapper", {
						onclick: (e) => this.close(),
					}, this.busy ? m(Icon, {
							icon: BootIcons.Progress,
							class: 'flex-center items-center icon-progress-search icon-progress'
						}) : m(Icon, {
							icon: Icons.Close,
							class: "flex-center items-center icon-large",
							style: {
								fill: theme.header_button,
								//"margin-top": (this._hideLabel) ? "0px" : "-2px"
							}
						}))]),

				]),
				m(".nav-bar-spacer")
			])
		}

		let shortcuts = this._setupShortcuts()
		let indexStateStream
		let routeChangeStream
		this.oncreate = () => {
			keyManager.registerShortcuts(shortcuts)
			indexStateStream = locator.search.indexState.map((newState: SearchIndexStateInfo) => {
				this.showIndexingProgress(newState, m.route.get())
			})
			routeChangeStream = routeChange.map((e: RouteChangeEvent) => {
				if (e.requestedPath.startsWith("/search/mail")) {
					let indexState = locator.search.indexState()
					this.showIndexingProgress(indexState, e.requestedPath)
				} else {
					closeOverlay()
				}
			})
		}
		this.onbeforeremove = () => {
			keyManager.unregisterShortcuts(shortcuts)
			if (indexStateStream) {
				indexStateStream.end(true)
			}
			if (routeChangeStream) {
				routeChangeStream.end(true)
			}
			closeOverlay()
		}
	}

	showIndexingProgress(newState: SearchIndexStateInfo, route: string) {
		if (this._domWrapper && newState.progress > 0 && ((this.focused && route.startsWith("/mail") ) || (route.startsWith("/search/mail") && newState.progress <= 100))) {
			let buttonRect: ClientRect = this._domWrapper.getBoundingClientRect()
			let cancelButton = new Button("cancel_action", () => {
				worker.cancelMailIndexing()
			}, () => Icons.Cancel)
			displayOverlay(buttonRect, {
				view: () => {
					return m(".plr-l.pt-s.pb-s.flex.items-center.flex-space-between", {
						style: {
							height: px(52)
						}
					}, [
						m("", lang.get("createSearchIndex_msg", {"{progress}": newState.progress})),
						newState.progress != 100 ? m("div", {onmousedown: e => this.skipNextBlur = true,}, m(cancelButton)) : null
					])
				}
			})
			m.redraw()
		} else if ((route.startsWith("/search/mail") && newState.progress == 0)) {
			closeOverlay()
		}
	}


	_setupShortcuts(): Shortcut[] {
		return [
			{
				key: Keys.F,
				enabled: () => logins.isInternalUserLoggedIn(),
				exec: key => {
					this.focus()
					m.redraw()
				},
				help: "search_label"
			},
		]


	}

	// TODO: remove this and take the list id from the url as soon as the list id is included in user and group settings
	setGroupInfoRestrictionListId(listId: Id) {
		this._groupInfoRestrictionListId = listId
	}

	showDropdown(searchResult: SearchResult) {
		let newResults = []
		Promise.all([
			Promise.map(searchResult.results.slice(0, 10), r => load(searchResult.restriction.type, r)
				.catch(NotFoundError, () => console.log("mail from search index not found", r))
				.catch(NotAuthorizedError, () => console.log("no permission on instance from search index", r))
			).then(resultInstances => {
				let filteredInstances = resultInstances.filter(instance => instance) // filter not found results
				if (isSameTypeRef(searchResult.restriction.type, ContactTypeRef)) {
					filteredInstances.sort((o1, o2) => compareContacts((o1:any), (o2:any)))
				}
				newResults = newResults.concat(filteredInstances)
			})]
		).then(() => {
			if (this.value() == searchResult.query) {
				this._results = newResults
				let resultCount = (searchResult.results.length)
				if (resultCount == 0 || resultCount > 10 || searchResult.currentIndexTimestamp != FULL_INDEXED_TIMESTAMP) {
					this._results.push({
						resultCount: resultCount,
						shownCount: this._results.length,
						indexTimestamp: searchResult.currentIndexTimestamp,
						allowShowMore: !searchResult.restriction || !isSameTypeRef(searchResult.restriction.type, GroupInfoTypeRef)
					}) // add SearchMoreAction
				}
				if (this._results.length > 0) {
					this._selected = this._results[0]
				} else {
					this._selected = null
				}
			}
			if (this._domWrapper != null && this.value().trim() != "" && this.focused) {
				let buttonRect: ClientRect = this._domWrapper.getBoundingClientRect()
				displayOverlay(buttonRect, {
					view: () => {
						return m("ul.list.click.mail-list", [
							this._results.map(result => {
								return m("li.plr-l.pt-s.pb-s", {
									style: {
										height: px(52),
										'border-left': px(size.border_selection) + " solid transparent",
									},
									onmousedown: e => this.skipNextBlur = true,
									onclick: e => this._selectResult(result),
									class: this._selected === result ? "row-selected" : "",
								}, this.renderResult(result))
							}),
						])
					}
				})
			}
			// updates the suggestion list if the dropdown is already visible
			m.redraw()
		})
	}

	renderResult(result: Mail|Contact|GroupInfo|ShowMoreAction) {
		let type: ?TypeRef = result._type ? result._type : null
		if (!type) { // show more action
			let showMoreAction = ((result:any):ShowMoreAction)
			let infoText
			if (showMoreAction.resultCount == 0) {
				infoText = lang.get("searchNoResults_msg")
			} else if (showMoreAction.allowShowMore) {
				infoText = lang.get("showMore_action")
			} else {
				infoText = lang.get("moreResultsFound_msg", {"{1}": showMoreAction.resultCount - showMoreAction.shownCount})
			}

			let indexInfo
			if (showMoreAction.indexTimestamp > FULL_INDEXED_TIMESTAMP) {
				indexInfo = lang.get("searchedUntil_msg") + " " + formatDateWithWeekday(new Date(showMoreAction.indexTimestamp))
			}
			return indexInfo ? [m(".top.flex-center", infoText), m(".bottom.flex-center.small", indexInfo)] : m("li.plr-l.pt-s.pb-s.items-center.flex-center", m(".flex-center", infoText))

		} else if (isSameTypeRef(MailTypeRef, type)) {
			let mail = ((result:any):Mail)
			return [m(".top.flex-space-between", [
				m("small.text-ellipsis", getSenderOrRecipientHeading(mail, true)),
				m("small.text-ellipsis.flex-fixed", formatDateTimeFromYesterdayOn(mail.receivedDate))
			]),
				m(".bottom.flex-space-between", [
					m(".text-ellipsis", mail.subject),
					m(".icons.flex-fixed", {style: {"margin-right": "-3px"}}, [ // 3px to neutralize the svg icons internal border border
						m(Icon, {
							icon: Icons.Attachment,
							class: this._selected === result ? "svg-content-accent-fg" : "svg-content-fg",
							style: {display: mail.attachments ? '' : 'none'},
						}),
					])
				])
			]
		} else if (isSameTypeRef(ContactTypeRef, type)) {
			let contact = ((result:any):Contact)
			return [
				m(".top.flex-space-between",
					m(".name", contact.firstName + " " + contact.lastName),
				),
				m(".bottom.flex-space-between",
					m("small.mail-address", (contact.mailAddresses && contact.mailAddresses.length > 0) ? contact.mailAddresses[0].address : ""),
				)
			]
		} else if (isSameTypeRef(GroupInfoTypeRef, type)) {
			let groupInfo = ((result:any):GroupInfo)
			return [
				m(".top.flex-space-between",
					m(".name", groupInfo.name),
				),
				m(".bottom.flex-space-between", [
					m("small.mail-address", groupInfo.mailAddress),
					m(".icons.flex", [
						(groupInfo.deleted) ? m(Icon, {
								icon: Icons.Trash,
								class: "svg-list-accent-fg",
							}) : null,
						(!groupInfo.mailAddress && m.route.get().startsWith('/settings/groups')) ? m(Icon, {
								icon: Icons.People,
								class: "svg-list-accent-fg",
							}) : null,
						(groupInfo.mailAddress && m.route.get().startsWith('/settings/groups')) ? m(Icon, {
								icon: BootIcons.Mail,
								class: "svg-list-accent-fg",
							}) : null
					])
				])
			]
		}
	}

	_selectResult(result: ?Mail|Contact|GroupInfo|ShowMoreAction) {
		if (result != null) {
			closeOverlay()
			this._domInput.blur()
			let type: ?TypeRef = result._type ? result._type : null
			if (!type) { // click on SHOW MORE button
				if (result.allowShowMore) {
					setSearchUrl(getSearchUrl(this.value(), getRestriction(m.route.get())))
				}
			} else if (isSameTypeRef(MailTypeRef, type)) {
				let mail = ((result:any):Mail)
				setSearchUrl(getSearchUrl(this.value(), getRestriction(m.route.get()), mail._id[1]))
			} else if (isSameTypeRef(ContactTypeRef, type)) {
				let contact = ((result:any):Contact)
				setSearchUrl(getSearchUrl(this.value(), getRestriction(m.route.get()), contact._id[1]))
			} else if (isSameTypeRef(GroupInfoTypeRef, type)) {
				this.lastSelectedGroupInfoResult(result)
			}
		}
	}

	handleSearchClick(e: MouseEvent) {
		if (!this.focused) {
			this.focus()
		} else {
			this.search()
		}
	}

	search() {
		let value = this.value()
		let restriction = getRestriction(m.route.get())
		if (isSameTypeRef(restriction.type, GroupInfoTypeRef)) {
			restriction.listId = this._groupInfoRestrictionListId
		}

		if (!locator.search.indexState().mailIndexEnabled && restriction && isSameTypeRef(restriction.type, MailTypeRef)) {
			this.expanded = false
			Dialog.confirm("enableSearchMailbox_msg", "search_label").then(confirmed => {
				if (confirmed) {
					worker.enableMailIndexing().then(() => {
						this.search()
						this.focus()
					})
				}
			})

		} else {
			if (value.trim() == "") {
				this.busy = false
				locator.search.result(null)
				return
			} else if (!locator.search.isNewSearch(value, restriction)) {
				if (!m.route.get().startsWith("/search") && locator.search.result()) {
					this.showDropdown(locator.search.result())
				}
				this.busy = false
				return
			}
			this.busy = true
			setTimeout(() => {
				if (value == this.value()) {
					if (this.value().trim() != "") {
						locator.search.search(value, restriction).then(result => {
							if (m.route.get().startsWith("/search")) {
								this.busy = false
								setSearchUrl(getSearchUrl(value, restriction))
								return // instances will be displayed as part of the list of the search view, when the search view is displayed
							} else {
								this.showDropdown(result)
							}
						}).finally(() => this.busy = false)
					} else {
						this.busy = false
					}
				} else if (this.value().trim() == "") {
					this.busy = false
				}
				m.redraw()
			}, 500)
		}
	}

	close() {
		if (this.expanded) {
			this.expanded = false
			this.value("")
			this._domInput.blur()
			closeOverlay()
		}
		if (m.route.get().startsWith("/search")) {
			locator.search.result(null)
		}
	}

	_getInputField(): VirtualElement {
		return m("input.input", {
			type: Type.Text,
			value: this.value(),
			oncreate: (vnode) => {
				this._domInput = vnode.dom
			},
			onfocus: (e) => this.focus(),
			onblur: e => {
				if (this.skipNextBlur) {
					this._domInput.focus()
				} else {
					this.blur(e)
				}
				this.skipNextBlur = false
			},
			onremove: () => {
				this._domInput.onblur = null
			},
			oninput: e => {
				if (this.value() != this._domInput.value) {
					this.value(this._domInput.value) // update the input on each change
					let value = this.value()
					if (value.trim() === "") {
						closeOverlay()
						locator.search.result(null)
					} else {
						this.search()
					}
				}
			},
			onkeydown: e => {
				let keyCode = e.which
				if (keyCode == Keys.ESC.code) {
					this.close()
				} else if (keyCode == Keys.RETURN.code) {
					if (this._selected) {
						this._selectResult(this._selected)
					} else {
						this.search()
					}
				} else if (keyCode == Keys.UP.code) {
					if (this._results.length > 0) {
						let selected = this._selected ? this._selected : this._results[0]
						this._selected = this._results[mod(this._results.indexOf(selected) - 1, this._results.length)]
					}
				} else if (keyCode == Keys.DOWN.code) {
					if (this._results.length > 0) {
						let selected = this._selected ? this._selected : this._results[0]
						this._selected = this._results[mod(this._results.indexOf(selected) + 1, this._results.length)]
					}
				}
				// disable key bindings
				e.stopPropagation()
				return true
			},
			style: {
				"line-height": px(inputLineHeight),
				//'min-height': px(inputLineHeight),
			}
		})
	}


	focus() {
		if (!this.focused) {
			this.focused = true
			this.expanded = true
			this._domInput.focus()
			this._domInput.select()
			this.showIndexingProgress(locator.search.indexState(), m.route.get())
			this.search()
			//this._domWrapper.classList.add("active")
		}
	}

	blur(e: MouseEvent) {
		//this._domInput.classList.remove("active")
		this.focused = false
		closeOverlay()
		if (this.value().trim() == "") {
			this.expanded = false
			if (m.route.get().startsWith("/search")) {
				locator.search.result(null)
			}
		}
	}

	isVisible() {
		let route = m.route.get()
		return styles.isDesktopLayout() && logins.isInternalUserLoggedIn() && (route.startsWith("/search") || route.startsWith("/mail") || route.startsWith("/contact") || route.startsWith("/settings/users") || route.startsWith("/settings/groups"))
	}

}
