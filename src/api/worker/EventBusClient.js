// @flow
import type {LoginFacade} from "./facades/LoginFacade"
import type {MailFacade} from "./facades/MailFacade"
import type {WorkerImpl} from "./WorkerImpl"
import {decryptAndMapToInstance} from "./crypto/CryptoFacade"
import {assertWorkerOrNode, getWebsocketOrigin, isAdminClient, isTest, Mode} from "../Env"
import {_TypeModel as MailTypeModel} from "../entities/tutanota/Mail"
import {load, loadAll, loadRange} from "./EntityWorker"
import {firstBiggerThanSecond, GENERATED_MAX_ID, GENERATED_MIN_ID, getLetId} from "../common/EntityFunctions"
import {ConnectionError, handleRestError, NotAuthorizedError, NotFoundError, ServiceUnavailableError} from "../common/error/RestError"
import {EntityEventBatchTypeRef} from "../entities/sys/EntityEventBatch"
import {downcast, identity, neverNull, randomIntFromInterval} from "../common/utils/Utils"
import {OutOfSyncError} from "../common/error/OutOfSyncError"
import {contains} from "../common/utils/ArrayUtils"
import type {Indexer} from "./search/Indexer"
import type {CloseEventBusOptionEnum} from "../common/TutanotaConstants"
import {CloseEventBusOption, GroupType} from "../common/TutanotaConstants"
import {_TypeModel as WebsocketEntityDataTypeModel} from "../entities/sys/WebsocketEntityData"
import {CancelledError} from "../common/error/CancelledError"

assertWorkerOrNode()


const EventBusState = Object.freeze({
	Automatic: "automatic", // automatic reconnection is enabled
	Suspended: "suspended", // automatic reconnection is suspended but can be enabled again
	Terminated: "terminated" // automatic reconnection is disabled and websocket is closed but can be opened again by calling connect explicit
})

type EventBusStateEnum = $Values<typeof EventBusState>;

const RETRY_AFTER_SERVICE_UNAVAILABLE_ERROR_MS = 30000

export class EventBusClient {
	_MAX_EVENT_IDS_QUEUE_LENGTH: number;

	_indexer: Indexer;
	_cache: EntityRestInterface;
	_worker: WorkerImpl;
	_mail: MailFacade;
	_login: LoginFacade;

	_state: EventBusStateEnum;
	_socket: ?WebSocket;
	_immediateReconnect: boolean; // if true tries to reconnect immediately after the websocket is closed
	_lastEntityEventIds: {[key: Id]: Id[]}; // maps group id to last event ids (max. 1000). we do not have to update these event ids if the groups of the user change because we always take the current users groups from the LoginFacade.
	_queueWebsocketEvents: boolean

	_websocketWrapperQueue: WebsocketEntityData[]; // in this array all arriving WebsocketWrappers are stored as long as we are loading or processing EntityEventBatches

	_reconnectTimer: ?TimeoutID;
	_connectTimer: ?TimeoutID;

	/**
	 * Represents a currently retried executing due to a ServiceUnavailableError
	 */
	_serviceUnavailableRetry: ?Promise<void>;

	constructor(worker: WorkerImpl, indexer: Indexer, cache: EntityRestInterface, mail: MailFacade, login: LoginFacade) {
		this._worker = worker
		this._indexer = indexer
		this._cache = cache
		this._mail = mail
		this._login = login
		this._socket = null
		this._state = EventBusState.Automatic
		this._reconnectTimer = null
		this._connectTimer = null
		this._reset()

		// we store the last 1000 event ids per group, so we know if an event was already processed.
		// it is not sufficient to check the last event id because a smaller event id may arrive later
		// than a bigger one if the requests are processed in parallel on the server
		this._MAX_EVENT_IDS_QUEUE_LENGTH = 1000
	}

	_reset(): void {
		this._immediateReconnect = false
		this._lastEntityEventIds = {}
		this._queueWebsocketEvents = false
		this._websocketWrapperQueue = []
		this._serviceUnavailableRetry = null
	}

	/**
	 * Opens a WebSocket connection to receive server events.
	 * @param reconnect Set to true if the connection has been opened before.
	 * @returns The event bus client object.
	 */
	connect(reconnect: boolean) {
		if (env.mode === Mode.Test) {
			return
		}

		console.log("ws connect reconnect=", reconnect, "state:", this._state);
		this._websocketWrapperQueue = []
		// make sure a retry will be cancelled by setting _serviceUnavailableRetry to null
		this._serviceUnavailableRetry = null
		this._worker.updateWebSocketState("connecting")
		this._state = EventBusState.Automatic
		this._connectTimer = null

		const authHeaders = this._login.createAuthHeaders()
		// Native query building is not supported in old browser, mithril is not available in the worker
		const authQuery =
			"modelVersions=" + WebsocketEntityDataTypeModel.version + "." + MailTypeModel.version
			+ "&clientVersion=" + env.versionNumber
			+ "&userId=" + this._login.getLoggedInUser()._id
			+ "&" + ("accessToken=" + authHeaders.accessToken)
		let url = getWebsocketOrigin() + "/event?" + authQuery;
		this._unsubscribeFromOldWebsocket()
		this._socket = new WebSocket(url);
		this._socket.onopen = () => {
			console.log("ws open: ", new Date(), "state:", this._state);
			this._initEntityEvents(reconnect)
			this._worker.updateWebSocketState("connected")
		};
		this._socket.onclose = (event: CloseEvent) => this._close(event);
		this._socket.onerror = (error: any) => this._error(error);
		this._socket.onmessage = (message: MessageEvent) => this._message(message);
	}

	_initEntityEvents(reconnect: boolean) {
		this._queueWebsocketEvents = true
		let p = ((reconnect && Object.keys(this._lastEntityEventIds).length > 0) ? this._loadMissedEntityEvents() : this._setLatestEntityEventIds())
		p.then(() => {
			this._queueWebsocketEvents = false
		}).catch(ConnectionError, e => {
			console.log("not connected in connect(), close websocket", e)
			this.close(CloseEventBusOption.Reconnect)
		}).catch(CancelledError, e => {
			// the processing was aborted due to a reconnect. do not reset any attributes because they might already be in use since reconnection
			console.log("cancelled retry process entity events after reconnect")
		}).catch(ServiceUnavailableError, e => {
			// a ServiceUnavailableError is a temporary error and we have to retry to avoid data inconsistencies
			this._lastEntityEventIds = {}
			console.log("retry init entity events in 30s", e)
			let promise = Promise.delay(RETRY_AFTER_SERVICE_UNAVAILABLE_ERROR_MS).then(() => {
				// if we have a websocket reconnect we have to stop retrying
				if (this._serviceUnavailableRetry === promise) {
					console.log("retry initializing entity events")
					return this._initEntityEvents(reconnect)
				} else {
					console.log("cancel initializing entity events")
				}
			})
			this._serviceUnavailableRetry = promise
			return promise
		}).catch(e => {
			this._queueWebsocketEvents = false
			this._worker.sendError(e)
		})
	}


	/**
	 * Sends a close event to the server and finally closes the connection.
	 * The state of this event bus client is reset and the client is terminated (does not automatically reconnect) except reconnect == true
	 */
	close(closeOption: CloseEventBusOptionEnum) {
		console.log("ws close: ", new Date(), "closeOption: ", closeOption, "state:", this._state);
		switch (closeOption) {
			case CloseEventBusOption.Terminate:
				this._terminate()
				break
			case CloseEventBusOption.Pause:
				this._state = EventBusState.Suspended
				this._worker.updateWebSocketState("connecting")
				break
			case CloseEventBusOption.Reconnect:
				this._worker.updateWebSocketState("connecting")
				break;
		}

		if (this._socket && this._socket.close) { // close is undefined in node tests
			this._socket.close()
		}
	}

	_unsubscribeFromOldWebsocket() {
		if (this._socket) {
			// Remove listeners. We don't want old socket to mess our state
			this._socket.onopen = this._socket.onclose = this._socket.onerror = this._socket.onmessage = identity
		}
	}

	_terminate(): void {
		this._state = EventBusState.Terminated
		this._reset()
		this._worker.updateWebSocketState("terminated")
	}

	_error(error: any) {
		console.log("ws error: ", error, "state:", this._state);
	}

	_message(message: MessageEvent): Promise<void> {
		//console.log("ws message: ", message.data);
		const [type, value] = downcast(message.data).split(";")
		if (type === "entityUpdate") {
			return decryptAndMapToInstance(WebsocketEntityDataTypeModel, JSON.parse(value), null)
				.then(data => {
					// When an event batch is received only process it if there is no other event batch currently processed. Otherwise put it into the cache. After processing an event batch we
					// start processing the next one from the cache. This makes sure that all events are processed in the order they are received and we do not get an inconsistent state
					if (this._queueWebsocketEvents) {
						this._websocketWrapperQueue.push(data)
					} else {
						this._queueWebsocketEvents = true
						return this._processEntityEvents(data.eventBatch, data.eventBatchOwner, data.eventBatchId).then(() => {
							if (this._websocketWrapperQueue.length > 0) {
								return this._processQueuedEvents()
							}
						}).then(() => {
							this._queueWebsocketEvents = false
						}).catch(ConnectionError, e => {
							this._queueWebsocketEvents = false
							console.log("not connected in _message(), close websocket", e)
							this.close(CloseEventBusOption.Reconnect)
						}).catch(CancelledError, e => {
							// the processing was aborted due to a reconnect. do not reset any attributes because they might already be in use since reconnection
							console.log("cancelled retry process entity events after _message call")
						}).catch(e => {
							this._queueWebsocketEvents = false
							this._worker.sendError(e)
						})
					}
				})
		} else if (type === "unreadCounterUpdate") {
			this._worker.updateCounter(JSON.parse(value))
		}
		return Promise.resolve()
	}

	_close(event: CloseEvent) {
		console.log("ws _close: ", event, new Date(), "state:", this._state);
		// Avoid running into penalties when trying to authenticate with an invalid session
		// NotAuthenticatedException 401, AccessDeactivatedException 470, AccessBlocked 472
		// do not catch session expired here because websocket will be reused when we authenticate again
		if (event.code === 4401 || event.code === 4470 || event.code === 4472) {
			this._terminate()
			this._worker.sendError(handleRestError(event.code - 4000, "web socket error"))
		} else if (event.code === 4440) {
			// session is expired. do not try to reconnect until the user creates a new session
			this._state = EventBusState.Suspended
			this._worker.updateWebSocketState("connecting")
		} else if (this._state === EventBusState.Automatic && this._login.isLoggedIn()) {
			this._worker.updateWebSocketState("connecting")

			if (this._immediateReconnect) {
				this._immediateReconnect = false
				this.tryReconnect(false, false);
			} else {
				this.tryReconnect(false, false, 1000 * randomIntFromInterval(30, 120))
			}
		}
	}

	tryReconnect(closeIfOpen: boolean, enableAutomaticState: boolean, delay: ?number = null) {
		if (this._reconnectTimer) {
			// prevent reconnect race-condition
			clearTimeout(this._reconnectTimer)
			this._reconnectTimer = null
		}

		if (!delay) {
			this._reconnect(closeIfOpen, enableAutomaticState)
		} else {
			this._reconnectTimer = setTimeout(() => this._reconnect(false, false), delay);
		}
	}

	/**
	 * Tries to reconnect the websocket if it is not connected.
	 */
	_reconnect(closeIfOpen: boolean, enableAutomaticState: boolean) {
		console.log("ws _reconnect socket state (CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3): "
			+ ((this._socket) ? this._socket.readyState : "null"), "state:", this._state,
			"closeIfOpen", closeIfOpen, "enableAutomaticState", enableAutomaticState);
		if (this._state !== EventBusState.Terminated && enableAutomaticState) {
			this._state = EventBusState.Automatic
		}
		if (closeIfOpen && this._socket && this._socket.readyState === WebSocket.OPEN) {
			this._immediateReconnect = true
			neverNull(this._socket).close();
		} else if (
			(this._socket == null || this._socket.readyState === WebSocket.CLOSED
				|| this._socket.readyState === WebSocket.CLOSING)
			&& this._state !== EventBusState.Terminated
			&& this._login.isLoggedIn()) {
			// Don't try to connect right away because connection may not be actually there
			// see #1165
			if (this._connectTimer) {
				clearTimeout(this._connectTimer)
			}
			this._connectTimer = setTimeout(() => this.connect(true), 100)
		}
	}


	/**
	 * stores the latest event batch ids for each of the users groups or min id if there is no event batch yet.
	 * this is needed to know from where to start loading missed events after a reconnect
	 */
	_setLatestEntityEventIds(): Promise<void> {
		// set all last event ids in one step to avoid that we have just set them for a few groups when a ServiceUnavailableError occurs
		let lastIds: {[key: Id]: Id[]} = {}
		return Promise.each(this._eventGroups(), groupId => {
			return loadRange(EntityEventBatchTypeRef, groupId, GENERATED_MAX_ID, 1, true).then(batches => {
				lastIds[groupId] = [
					(batches.length === 1) ? getLetId(batches[0])[1] : GENERATED_MIN_ID
				]
			})
		}).then(() => {
			this._lastEntityEventIds = lastIds
			return this._processQueuedEvents()
		})
	}

	_loadMissedEntityEvents(): Promise<void> {
		if (this._login.isLoggedIn()) {
			return this._checkIfEntityEventsAreExpired().then(expired => {
				if (expired) {
					return this._worker.sendError(new OutOfSyncError())
				} else {
					return Promise.each(this._eventGroups(), groupId => {
						return loadAll(EntityEventBatchTypeRef, groupId, this._getLastEventBatchIdOrMinIdForGroup(groupId))
							.each(eventBatch => {
								return this._processEntityEvents(eventBatch.events, groupId, getLetId(eventBatch)[1])
							})
							.catch(NotAuthorizedError, () => {
								console.log("could not download entity updates => lost permission")
							})
					}).then(() => {
						return this._processQueuedEvents()
					})
				}
			})
		} else {
			return Promise.resolve()
		}
	}

	_processQueuedEvents(): Promise<void> {
		if (this._websocketWrapperQueue.length === 0) {
			return Promise.resolve()
		} else {
			let wrapper = this._websocketWrapperQueue.shift()
			// check if we have already processed this queued event when loading the EntityEventBatch
			let groupId = neverNull(wrapper.eventBatchOwner)
			let eventId = neverNull(wrapper.eventBatchId)
			let p = Promise.resolve()
			if (!this._isAlreadyProcessed(groupId, eventId)) {
				p = this._processEntityEvents(wrapper.eventBatch, groupId, eventId);
			}
			return p.then(() => {
				return this._processQueuedEvents()
			})
		}
	}

	_processEntityEvents(events: EntityUpdate[], groupId: Id, batchId: Id): Promise<void> {
		return this._executeIfNotTerminated(() => {
			return this._cache.entityEventsReceived(events)
			           .then(filteredEvents => {
				           return this._executeIfNotTerminated(() => this._login.entityEventsReceived(filteredEvents))
				                      .then(() => this._executeIfNotTerminated(() => this._mail.entityEventsReceived(filteredEvents)))
				                      .then(() => this._executeIfNotTerminated(() => this._worker.entityEventsReceived(filteredEvents, groupId)))
				                      .return(filteredEvents)
			           })
			           .then(filteredEvents => {
				           if (!this._lastEntityEventIds[groupId]) {
					           this._lastEntityEventIds[groupId] = []
				           }
				           this._lastEntityEventIds[groupId].push(batchId)
				           // make sure the batch ids are in ascending order, so we use the highest id when downloading all missed events after a reconnect
				           this._lastEntityEventIds[groupId].sort((e1, e2) => {
					           if (e1 === e2) {
						           return 0
					           } else {
						           return firstBiggerThanSecond(e1, e2) ? 1 : -1
					           }
				           })
				           if (this._lastEntityEventIds[groupId].length > this._MAX_EVENT_IDS_QUEUE_LENGTH) {
					           this._lastEntityEventIds[groupId].shift()
				           }

				           // Call the indexer in this last step because now the processed event is stored and the indexer has a separate event queue that
				           // shall not receive the event twice.
				           if (!isTest() && !isAdminClient()) {
					           this._executeIfNotTerminated(() => {
						           this._indexer.addBatchesToQueue([{groupId, batchId, events: filteredEvents}])
						           console.log("_indexer.startProcessing from EventBusClient")
						           this._indexer.startProcessing()
					           })
				           }
			           })
		}).catch(ServiceUnavailableError, e => {
			// a ServiceUnavailableError is a temporary error and we have to retry to avoid data inconsistencies
			console.log("retry processing event in 30s", e)
			let promise = Promise.delay(RETRY_AFTER_SERVICE_UNAVAILABLE_ERROR_MS).then(() => {
				// if we have a websocket reconnect we have to stop retrying
				if (this._serviceUnavailableRetry === promise) {
					return this._processEntityEvents(events, groupId, batchId)
				} else {
					throw new CancelledError("stop retry processing after service unavailable due to reconnect")
				}
			})
			this._serviceUnavailableRetry = promise
			return promise
		})
	}

	/**
	 * Tries to load the last EntityEventBatch if we had loaded it before. If the batch can be loaded all later event batches are available. If it can not be loaded we assume that at least some later events are also expired.
	 * @return True if the events have expired, false otherwise.
	 */
	_checkIfEntityEventsAreExpired(): Promise<boolean> {
		return Promise.each(this._eventGroups(), groupId => {
			let lastEventBatchId = this._getLastEventBatchIdOrMinIdForGroup(groupId)
			if (lastEventBatchId !== GENERATED_MIN_ID) {
				return load(EntityEventBatchTypeRef, [groupId, lastEventBatchId]).catch(NotAuthorizedError, () => {
					console.log("could not download entity updates => lost permission")
				})
			}
		}).then(() => {
			return false
		}).catch(NotFoundError, () => {
			return true
		})
	}

	_getLastEventBatchIdOrMinIdForGroup(groupId: Id): Id {
		// TODO handle lost updates (old event surpassed by newer one, we store the new id and retrieve instances from the newer one on next login
		return (this._lastEntityEventIds[groupId] && this._lastEntityEventIds[groupId].length > 0) ?
			this._lastEntityEventIds[groupId][this._lastEntityEventIds[groupId].length - 1] : GENERATED_MIN_ID
	}

	_isAlreadyProcessed(groupId: Id, eventId: Id): boolean {
		if (this._lastEntityEventIds[groupId] && this._lastEntityEventIds[groupId].length > 0) {
			return firstBiggerThanSecond(this._lastEntityEventIds[groupId][0], eventId)
				|| contains(this._lastEntityEventIds[groupId], eventId)
		} else {
			return false
		}
	}

	_executeIfNotTerminated(call: Function): Promise<void> {
		if (this._state !== EventBusState.Terminated) {
			return call()
		} else {
			return Promise.resolve()
		}
	}

	_eventGroups(): Id[] {
		return this._login.getLoggedInUser().memberships
		           .filter(membership => membership.groupType !== GroupType.MailingList)
		           .map(membership => membership.group)
		           .concat(this._login.getLoggedInUser().userGroup.group)
	}
}
