//@flow

import {OperationType} from "../../common/TutanotaConstants"
import {assertNotNull, containsEventOfType, getEventOfType} from "../../common/utils/Utils"
import {ConnectionError, ServiceUnavailableError} from "../../common/error/RestError"
import type {WorkerImpl} from "../WorkerImpl"
import type {EntityUpdate} from "../../entities/sys/EntityUpdate"
import {isSameId, isSameTypeRefByAttr} from "../../common/EntityFunctions"
import {findAllAndRemove, findAndRemove, firstThrow, last, remove} from "../../common/utils/ArrayUtils"
import {ProgrammingError} from "../../common/error/ProgrammingError"
import {createEntityUpdate} from "../../entities/sys/EntityUpdate"
import {MailTypeRef} from "../../entities/tutanota/Mail"

export type QueuedBatch = {
	events: EntityUpdate[], groupId: Id, batchId: Id
}


export const EntityModificationType = Object.freeze({
	CREATE: 'CREATE',
	UPDATE: 'UPDATE',
	MOVE: 'MOVE',
	DELETE: 'DELETE',
})
export type EntityModificationTypeEnum = $Values<typeof EntityModificationType>

type QueueAction = (nextElement: QueuedBatch) => Promise<void>

/**
 * Whether the entity of the event supports MOVE operation. MOVE is supposed to be immutable so we cannot apply it to all instances.
 */
function isMovableEventType(event: EntityUpdate): boolean {
	return isSameTypeRefByAttr(MailTypeRef, event.application, event.type)
}

/**
 * Checks which modification is applied in the given batch for the entity id.
 * @param batch entity updates of the batch.
 * @param entityId
 */
export function batchMod(batch: $ReadOnlyArray<EntityUpdate>, entityId: Id): EntityModificationTypeEnum {
	for (const event of batch) {
		if (isSameId(event.instanceId, entityId)) {
			switch (event.operation) {
				case OperationType.CREATE:
					return isMovableEventType(event) && containsEventOfType(batch, OperationType.DELETE, entityId)
						? EntityModificationType.MOVE
						: EntityModificationType.CREATE
				case OperationType.UPDATE:
					return EntityModificationType.UPDATE
				case OperationType.DELETE:
					return isMovableEventType(event) && containsEventOfType(batch, OperationType.CREATE, entityId)
						? EntityModificationType.MOVE
						: EntityModificationType.DELETE
				default:
					throw new ProgrammingError(`Unknown operation: ${event.operation}`)
			}
		}
	}
	throw new ProgrammingError(`Empty batch?`)
}

export class EventQueue {
	/** Batches to process. Oldest first. */
	+_eventQueue: Array<QueuedBatch>;
	+_lastOperationForEntity: Map<Id, QueuedBatch>;
	+_queueAction: QueueAction;

	_processingBatch: ?QueuedBatch;
	_paused: boolean;

	/**
	 * @param queueAction which is executed for each batch. Must *never* throw.
	 */
	constructor(queueAction: QueueAction) {
		this._eventQueue = []
		this._lastOperationForEntity = new Map()
		this._processingBatch = null
		this._paused = false
		this._queueAction = queueAction
	}

	addBatches(batches: $ReadOnlyArray<QueuedBatch>) {
		for (const batch of batches) {
			this.add(batch.batchId, batch.groupId, batch.events)
		}
	}

	add(batchId: Id, groupId: Id, newEvents: $ReadOnlyArray<EntityUpdate>) {
		const newBatch: QueuedBatch = {events: [], groupId, batchId}

		for (const newEvent of newEvents) {
			const elementId = newEvent.instanceId
			const lastBatchForEntity = this._lastOperationForEntity.get(elementId)
			if (lastBatchForEntity == null || this._processingBatch != null && this._processingBatch === lastBatchForEntity) {
				// If there's no current operation, there's nothing to merge, just add
				// If current operation is already being processed, don't modify it, we cannot merge anymore and should just append.
				newBatch.events.push(newEvent)
			} else {
				const newEntityModification = batchMod(newEvents, elementId)
				const lastEntityModification = batchMod(lastBatchForEntity.events, elementId)


				if (newEntityModification === EntityModificationType.UPDATE) {
					switch (lastEntityModification) {
						case EntityModificationType.CREATE:
						// Skip create because the create was not processed yet and we will download the updated version already
						case EntityModificationType.UPDATE:
							// Skip update because the previous update was not processed yet and we will download the updated version already
							break;
						case EntityModificationType.MOVE:
							// Leave both, as we expect MOVE to not mutate the entity
							// We will execute this twice for DELETE and CREATE but it's fine, we need both
							newBatch.events.push(newEvent)
							break;
						case EntityModificationType.DELETE:
							throw new ProgrammingError("UPDATE not allowed after DELETE")
					}
				} else if (newEntityModification === EntityModificationType.MOVE) {
					if (newEvent.operation === OperationType.DELETE) {
						// We only want to process the CREAT event of the move operation
						continue;
					}
					switch (lastEntityModification) {
						case EntityModificationType.CREATE:
							// Replace old create with new create of the move event
							this._replace(lastBatchForEntity, newEvent)
							// ignore DELETE of move operation
							break;
						case EntityModificationType.UPDATE:
							// The instance is not at the original location anymore so we cannot leave update in because we won't be able to download
							// it but we also cannot say that it just moved so we need to actually delete and create it again
							const deleteEvent = assertNotNull(getEventOfType(newEvents, OperationType.DELETE, newEvent.instanceId))
							// Replace update with delete the old location
							this._replace(lastBatchForEntity, deleteEvent)
							newBatch.events.push(newEvent)
							break;
						case EntityModificationType.MOVE:
							// Replace move with a move from original location to the final destination
							const oldDelete = assertNotNull(getEventOfType(lastBatchForEntity.events, OperationType.DELETE, newEvent.instanceId))
							this._replace(lastBatchForEntity, newEvent)
							// replace removes all events so we need to add the old delete again
							lastBatchForEntity.events.unshift(oldDelete)
							break;
						case EntityModificationType.DELETE:
							throw new ProgrammingError("MOVE not allowed after DELETE")
					}
					// skip delete in favor of create so that we don't run the same conditions twice
				} else if (newEntityModification === EntityModificationType.DELETE) {
					// find first move operation
					const firstMoveIndex = this._eventQueue.findIndex((queuedBatch) => this._processingBatch !== queuedBatch
						&& batchMod(queuedBatch.events, elementId) === EntityModificationType.MOVE)
					if (firstMoveIndex !== -1) {
						// delete CREATE of first move and keep the DELETE event
						const firstMoveBatch = this._eventQueue[firstMoveIndex]
						const createEvent = getEventOfType(firstMoveBatch.events, OperationType.CREATE, elementId)
						createEvent && remove(firstMoveBatch.events, createEvent)
					} else {
						// add delete event
						newBatch.events.push(newEvent)
					}
					// delete all other events
					this.removeEventsForInstance(elementId, firstMoveIndex + 1)

				} else {
					throw new ProgrammingError(`Impossible modification combination ${lastEntityModification} ${newEntityModification}`)
				}
			}
		}
		if (newBatch.events.length !== 0) {
			this._eventQueue.push(newBatch)
			for (const update of newBatch.events) {
				this._lastOperationForEntity.set(update.instanceId, newBatch)
			}
		}
	}


	removeEventsForInstance(elementId: Id, startIndex: number = 0): void {
		// this will remove batches with an empty event list
		findAllAndRemove(this._eventQueue, (batchInThePast) => {
			if (this._processingBatch === batchInThePast) {
				return false
			}
			// this will remove all events for the element id from the batch
			findAllAndRemove(batchInThePast.events, (event) => isSameId(event.instanceId, elementId))
			return batchInThePast.events.length === 0
		}, startIndex)
	}

	start() {
		if (this._processingBatch) {
			return
		}
		this._processNext()
	}

	queueSize(): number {
		return this._eventQueue.length
	}

	_processNext() {
		if (this._paused) {
			return
		}
		const next = this._eventQueue[0]
		if (next) {
			this._processingBatch = next
			// TODO: we take the first one here but we don't always add to the queue

			this._queueAction(firstThrow(this._eventQueue))
			    .then(() => {
				    this._eventQueue.shift()
				    this._processingBatch = null
				    this._processNext()
			    })
			    .catch((e) => {
				    // TODO: is this ok? we probably want to resume sooner for EventBus and maybe we want to skip the event if it's not
				    //  handled
				    // processing continues if the event bus receives a new event
				    this._processingBatch = null
				    if (!(e instanceof ServiceUnavailableError || e instanceof ConnectionError)) {
					    console.error("Uncaught EventQueue error!", e)
				    }
			    })

		}
	}

	clear() {
		this._eventQueue.splice(0)
		for (const k of this._lastOperationForEntity.keys()) {
			this._lastOperationForEntity.delete(k)
		}
	}

	pause() {
		this._paused = true
	}

	resume() {
		this._paused = false
		this.start()
	}

	_replace(batch: QueuedBatch, newMod: EntityUpdate) {
		batch.events = batch.events.filter((e) => e.instanceId !== newMod.instanceId)
		batch.events.push(newMod)
	}
}
