// @flow
import {Type} from "../gui/base/TextField"
import m from "mithril"
import {Icons} from "../gui/base/icons/Icons"
import {logins} from "../api/main/LoginController"
import {inputLineHeight, px, size} from "../gui/size"
import stream from "mithril/stream/stream.js"
import {theme} from "../gui/theme"
import {Icon} from "../gui/base/Icon"
import {DefaultAnimationTime} from "../gui/animation/Animations"
import {BootIcons} from "../gui/base/icons/BootIcons"
import type {PositionRect} from "../gui/base/Overlay"
import {displayOverlay} from "../gui/base/Overlay"
import {NavButton} from "../gui/base/NavButton"
import {Dropdown} from "../gui/base/Dropdown"
import {MailTypeRef} from "../api/entities/tutanota/Mail"
import {ContactTypeRef} from "../api/entities/tutanota/Contact"
import {keyManager, Keys} from "../misc/KeyManager"
import {isSameTypeRef} from "../api/common/EntityFunctions"
import {mod} from "../misc/MathUtils"
import type {RouteChangeEvent} from "../misc/RouteChange"
import {routeChange} from "../misc/RouteChange"
import {NotAuthorizedError, NotFoundError} from "../api/common/error/RestError"
import {getRestriction, getSearchUrl, isAdministratedGroup, setSearchUrl} from "./SearchUtils"
import {locator} from "../api/main/MainLocator"
import {Dialog} from "../gui/base/Dialog"
import {worker} from "../api/main/WorkerClient"
import {GroupInfoTypeRef} from "../api/entities/sys/GroupInfo"
import {FULL_INDEXED_TIMESTAMP} from "../api/common/TutanotaConstants"
import {Button} from "../gui/base/Button"
import {assertMainOrNode, isApp} from "../api/Env"
import {compareContacts} from "../contacts/ContactUtils"
import {WhitelabelChildTypeRef} from "../api/entities/sys/WhitelabelChild"
import {styles} from "../gui/styles"
import {client} from "../misc/ClientDetector";
import {debounce, downcast} from "../api/common/utils/Utils"
import {load} from "../api/main/Entity"
import {PageSize} from "../gui/base/List"
import {BrowserType} from "../misc/ClientConstants"
import {hasMoreResults} from "./SearchModel"
import {SearchBarOverlay} from "./SearchBarOverlay"

assertMainOrNode()

export type ShowMoreAction = {
	resultCount: number,
	shownCount: number,
	indexTimestamp: number,
	allowShowMore: boolean
}

type SearchBarAttrs = {
	classes?: string,
	style?: {[string]: string},
	alwaysExpanded?: boolean,
	spacer?: boolean,
	placeholder?: ?string
}

const SEARCH_INPUT_WIDTH = 200 // includes input field and close/progress icon

const MAX_SEARCH_PREVIEW_RESULTS = 10

export type Entry = Mail | Contact | GroupInfo | WhitelabelChild | ShowMoreAction
type Entries = Array<Entry>

export type SearchBarState = {
	query: string,
	searchResult: ?SearchResult,
	indexState: SearchIndexStateInfo,
	entities: Entries,
	selected: ?Entry
}

export class SearchBar implements Component {
	view: Function;
	_domInput: HTMLInputElement;
	_domWrapper: HTMLElement;
	focused: boolean;
	expanded: boolean;
	dropdown: Dropdown;
	skipNextBlur: Stream<boolean>;
	_state: Stream<SearchBarState>
	oncreate: Function;
	onbeforeremove: Function;
	busy: boolean;
	_groupInfoRestrictionListId: ?Id;
	lastSelectedGroupInfoResult: Stream<GroupInfo>;
	lastSelectedWhitelabelChildrenInfoResult: Stream<WhitelabelChild>;
	_closeOverlayFunction: ?(() => void);
	_overlayContentComponent: {view: () => ?Children};

	constructor() {
		this._groupInfoRestrictionListId = null
		this.lastSelectedGroupInfoResult = stream()
		this.lastSelectedWhitelabelChildrenInfoResult = stream()
		this.focused = false
		this.skipNextBlur = stream(false)
		this.busy = false
		this._state = stream({
			query: "",
			searchResult: null,
			indexState: locator.search.indexState(),
			entities: ([]: Entries),
			selected: null
		})

		this._overlayContentComponent = {
			view: () => {
				return m(SearchBarOverlay, {
					state: this._state(),
					isQuickSearch: this._isQuickSearch(),
					isFocused: this.focused,
					isExpanded: this.expanded,
					skipNextBlur: this.skipNextBlur,
					selectResult: (selected) => this._selectResult(selected)
				})
			}
		}

		const navBtn = new NavButton('search_label', () => BootIcons.Mail, () => "/search", "/search")
		this.dropdown = new Dropdown(() => [navBtn], 250)
		this.view = (vnode: Vnode<SearchBarAttrs>): VirtualElement => {
			return m(".flex.flex-no-grow" + (vnode.attrs.classes || ""), {style: vnode.attrs.style}, [
				m(".search-bar.flex-end.items-center", {
					oncreate: (vnode) => {
						this._domWrapper = vnode.dom
						shortcuts = this._setupShortcuts()
						keyManager.registerShortcuts(shortcuts)
						locator.search.indexState.map((indexState) => {
							this._updateState({indexState})
						})
						indexStateStream = this._state.map((state) => {
							this._showOverlay()
							if (this._domInput) {
								const input = this._domInput
								if (state.query !== input.value) {
									input.value = state.query
								}
							}
							m.redraw()
						})
						routeChangeStream = routeChange.map((e: RouteChangeEvent) => {
							if (e.requestedPath.startsWith("/search/mail")) {
								let indexState = locator.search.indexState()
								this.showIndexingProgress(indexState, e.requestedPath)
							}
						})
					},
					onbeforeremove: () => {
						shortcuts && keyManager.unregisterShortcuts(shortcuts)
						if (indexStateStream) {
							indexStateStream.end(true)
						}
						if (routeChangeStream) {
							routeChangeStream.end(true)
						}
						this._closeOverlay()
					},
					style: {
						'min-height': px(inputLineHeight + 2), // 2 px border
						'padding-bottom': this.expanded ? (this.focused ? px(0) : px(1)) : px(2),
						'padding-top': px(2), // center input field
						'margin-right': px(styles.isDesktopLayout() ? 15 : 8),
						'border-bottom': vnode.attrs.alwaysExpanded
						|| this.expanded ? (this.focused ? `2px solid ${theme.content_accent}` : `1px solid ${theme.content_border}`) : "0px",
						'align-self': "center",
						'max-width': px(400),
						'flex': "1"
					}
				}, [
					styles.isDesktopLayout()
						? m(".ml-negative-xs.click", {
							onmousedown: (e) => {
								if (this.focused) {
									this.skipNextBlur(true) // avoid closing of overlay when clicking search icon
								}
							},
							onclick: (e) => {
								e.preventDefault()
								this.handleSearchClick(e)
							}
						}, m(Icon, {
							icon: BootIcons.Search,
							class: "flex-center items-center icon-large",
							style: {
								fill: this.focused ? theme.header_button_selected : theme.header_button,
							}
						}))
						: null,
					m(".searchInputWrapper.flex.items-center", {
							style: (() => {
								let paddingLeft: string
								if (this.expanded || vnode.attrs.alwaysExpanded) {
									if (styles.isDesktopLayout()) {
										paddingLeft = px(10)
									} else {
										paddingLeft = px(6)
									}
								} else {
									paddingLeft = px(0)
								}
								return {
									"width": this.inputWrapperWidth(!!vnode.attrs.alwaysExpanded),
									"transition": `width ${DefaultAnimationTime}ms`,
									'padding-left': paddingLeft,
									'padding-top': '3px',
									'padding-bottom': '3px',
									'overflow-x': 'hidden',
								}
							})()
						},
						[
							this._getInputField(vnode.attrs),
							m(".closeIconWrapper", {
								onclick: (e) => this.close(),
								style: {width: size.icon_size_large}
							}, this.busy
								? m(Icon, {
									icon: BootIcons.Progress,
									class: 'flex-center items-center icon-progress-search icon-progress'
								})
								: m(Icon, {
									icon: Icons.Close,
									class: "flex-center items-center icon-large",
									style: {fill: theme.header_button}
								}))
						]
					),
				]),
				(vnode.attrs.spacer ? m(".nav-bar-spacer") : null)
			])
		}
		let shortcuts = null

		let indexStateStream
		let routeChangeStream
	}

	inputWrapperWidth(alwaysExpanded: boolean): ?string {
		if (alwaysExpanded) {
			return "100%"
		} else {
			return this.expanded ? px(SEARCH_INPUT_WIDTH) : px(0)
		}
	}

	showIndexingProgress(newState: SearchIndexStateInfo, route: string) {
		if (this._domWrapper && newState.progress > 0 && ((this.focused && route.startsWith("/mail"))
			|| (route.startsWith("/search/mail") && newState.progress <= 100))) {
			let cancelButton = new Button("cancel_action", () => {
				worker.cancelMailIndexing()
			}, () => Icons.Cancel)
		}
	}

	/**
	 * Replace contents of the overlay if it was shown or display a new one
	 * if it wasn't
	 * @param contentFunction what to show in overlay
	 * @private
	 */
	_showOverlay() {
		if (this._closeOverlayFunction == null) {
			this._closeOverlayFunction = displayOverlay(this._makeOverlayRect(), this._overlayContentComponent)
		} else {
			m.redraw()
		}
	}

	_closeOverlay() {
		if (this._closeOverlayFunction) {
			this._closeOverlayFunction()
			this._closeOverlayFunction = null
		}
	}

	_makeOverlayRect(): PositionRect {
		let overlayRect: PositionRect
		if (styles.isDesktopLayout()) {
			const domRect = this._domWrapper.getBoundingClientRect()
			overlayRect = {
				top: px(domRect.bottom + 5),
				right: px(window.innerWidth - domRect.right),
				width: px(350)
			}
		} else {
			overlayRect = {
				top: px(size.navbar_height_mobile + 6),
				left: px(16),
				right: px(16),
			}
		}
		return overlayRect
	}

	_setupShortcuts(): Shortcut[] {
		return [
			{
				key: Keys.F,
				enabled: () => true,
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

	_downloadResults(searchResult: SearchResult): Promise<Entries> {
		if (searchResult.results.length === 0) {
			return Promise.resolve(([]))
		}
		const toFetch = searchResult.results.slice(0, MAX_SEARCH_PREVIEW_RESULTS)
		return Promise.map(toFetch, r => load(searchResult.restriction.type, r)
			.catch(NotFoundError, () => console.log("mail from search index not found"))
			.catch(NotAuthorizedError, () => console.log("no permission on instance from search index")))
	}


	_selectResult(result: ?Mail | Contact | GroupInfo | WhitelabelChild | ShowMoreAction) {
		const {query} = this._state()
		if (result != null) {
			this._domInput.blur()
			let type: ?TypeRef = result._type ? result._type : null
			if (!type) { // click on SHOW MORE button
				if (result.allowShowMore) {
					setSearchUrl(getSearchUrl(query, getRestriction(m.route.get())))
				}
			} else if (isSameTypeRef(MailTypeRef, type)) {
				let mail: Mail = downcast(result)
				setSearchUrl(getSearchUrl(query, getRestriction(m.route.get()), mail._id[1]))
			} else if (isSameTypeRef(ContactTypeRef, type)) {
				let contact: Contact = downcast(result)
				setSearchUrl(getSearchUrl(query, getRestriction(m.route.get()), contact._id[1]))
			} else if (isSameTypeRef(GroupInfoTypeRef, type)) {
				this.lastSelectedGroupInfoResult(downcast(result))
			} else if (isSameTypeRef(WhitelabelChildTypeRef, type)) {
				this.lastSelectedWhitelabelChildrenInfoResult(downcast(result))
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
		let {query} = this._state()
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
			if (!locator.search.isNewSearch(query, restriction)) {
				const result = locator.search.result()
				if (this._isQuickSearch() && result) {
					this._updateState({})
				}
				this.busy = false
			} else {
				if (query.trim() !== "") {
					this.busy = true
				}
				this._doSearch(query, restriction, () => {
					this.busy = false
					m.redraw()
				})
			}
		}
	}

	_doSearch = debounce(500, (query: string, restriction: SearchRestriction, cb: () => void) => {
		let useSuggestions = m.route.get().startsWith("/settings")
		const limit = isSameTypeRef(MailTypeRef, restriction.type)
			? this._isQuickSearch() ? MAX_SEARCH_PREVIEW_RESULTS : PageSize
			: null
		locator.search.search(query, restriction, useSuggestions ? 10 : 0, limit)
		       .then(result => {
			       this._updateState({searchResult: result})
			       if (!result) return
			       if (this._isQuickSearch()) {
				       return this._downloadResults(result)
				                  .then((entries) => {
					                  if (!locator.search.isNewSearch(query, restriction)) {
						                  const filteredResults = this._filterResults(entries, restriction)
						                  if (query.trim() !== ""
							                  && (filteredResults.length === 0
								                  || hasMoreResults(result)
								                  || result.currentIndexTimestamp !== FULL_INDEXED_TIMESTAMP)) {
							                  filteredResults.push({
								                  resultCount: result.results.length,
								                  shownCount: filteredResults.length,
								                  indexTimestamp: result.currentIndexTimestamp,
								                  allowShowMore: !isSameTypeRef(result.restriction.type, GroupInfoTypeRef)
									                  && !isSameTypeRef(result.restriction.type, WhitelabelChildTypeRef)
							                  })
						                  }
						                  this._updateState({entities: filteredResults})
					                  }
				                  })
			       } else {
				       // instances will be displayed as part of the list of the search view, when the search view is displayed
				       setSearchUrl(getSearchUrl(query, restriction))
			       }
		       })
		       .finally(() => cb())
	})

	close() {
		if (this.expanded) {
			this.expanded = false
			this._updateState({query: ""})
			this._domInput.blur() // remove focus from the input field in case ESC is pressed
		}
		if (m.route.get().startsWith("/search")) {
			locator.search.result(null)
			setSearchUrl(getSearchUrl("", getRestriction(m.route.get())))
		}
	}

	_isQuickSearch(): boolean {
		return !m.route.get().startsWith("/search")
	}

	_filterResults(instances: Entries, restriction: SearchRestriction): Entries {
		let filteredInstances = instances.filter(Boolean) // filter not found results

		// filter group infos for local admins
		if (isSameTypeRef(GroupInfoTypeRef, restriction.type)
			&& !logins.getUserController().isGlobalAdmin()) {
			let localAdminGroupIds = logins.getUserController()
			                               .getLocalAdminGroupMemberships()
			                               .map(gm => gm.group)
			filteredInstances = filteredInstances.filter(gi => isAdministratedGroup(localAdminGroupIds, downcast(gi)))
		}
		if (isSameTypeRef(restriction.type, ContactTypeRef)) {
			filteredInstances.sort((o1, o2) => compareContacts((o1: any), (o2: any)))
		}
		return filteredInstances
	}

	_getInputField(attrs: any): VirtualElement {
		return m("input.input.input-no-clear", {
			placeholder: attrs.placeholder,
			type: Type.Text,
			value: this._state().query,
			oncreate: (vnode) => {
				this._domInput = vnode.dom
			},
			onfocus: (e) => this.focus(),
			onblur: e => {
				if (this.skipNextBlur()) {
					setTimeout(() => this._domInput.focus(), 0) // setTimeout needed in Firefox to keep focus
				} else {
					this.blur(e)
				}
				this.skipNextBlur(false)
			},
			onremove: () => {
				this._domInput.onblur = null
			},
			oninput: e => {
				const domValue = this._domInput.value
				if (this._state().query !== domValue) {
					// update the input on each change
					this._updateState({query: domValue})
					this.search()
				}
			},
			onkeydown: e => {
				const {selected, entities} = this._state()
				let keyCode = e.which
				if (keyCode === Keys.ESC.code) {
					this.close()
				} else if (keyCode === Keys.RETURN.code) {
					if (selected) {
						this._selectResult(selected)
					} else {
						if (isApp()) {
							this._domInput.blur()
						} else {
							this.search()
						}
					}
				} else if (keyCode === Keys.UP.code) {
					if (entities.length > 0) {
						let oldSelected = selected || entities[0]
						this._updateState({
							selected: entities[mod(entities.indexOf(oldSelected) - 1, entities.length)]
						})
					}
				} else if (keyCode === Keys.DOWN.code) {
					if (entities.length > 0) {
						let newSelected = selected || entities[0]
						this._updateState({
							selected: entities[mod(entities.indexOf(newSelected) + 1, entities.length)]
						})
					}
				}
				// disable key bindings
				e.stopPropagation()
				return true
			},
			style: {
				"line-height": px(inputLineHeight)
			}
		})
	}


	focus() {
		if (!this.focused) {
			this.focused = true
			this.expanded = true
			// setTimeout to fix bug in current Safari with losing focus
			setTimeout(() => {
				this._domInput.select()
				this._domInput.focus()
				this.showIndexingProgress(locator.search.indexState(), m.route.get())
				this.search()
			}, client.browser === BrowserType.SAFARI ? 200 : 0)
		}
	}

	blur(e: MouseEvent) {
		this.focused = false
		if (this._state().query === "") {
			this.expanded = false
			if (m.route.get().startsWith("/search")) {
				locator.search.result(null)
				setSearchUrl(getSearchUrl("", getRestriction(m.route.get())))
			}
		}
	}

	getMaxWidth(): number {
		return SEARCH_INPUT_WIDTH + 40 // includes  input width + search icon(21) + margin right(15) + spacer(4)
	}

	_updateState(update: $Shape<SearchBarState>): SearchBarState {
		const newState = Object.assign({}, this._state(), update)
		this._state(newState)
		return newState
	}
}
