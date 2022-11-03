import { downcast, getFromMap } from "@tutao/tutanota-utils"
import { ArchiveDataType } from "../../common/TutanotaConstants"
import { assertWorkerOrNode } from "../../common/Env"
import { BlobAccessTokenService } from "../../entities/storage/Services"
import { Blob } from "../../entities/sys/TypeRefs.js"
import { Instance } from "../../common/EntityTypes"
import { IServiceExecutor } from "../../common/ServiceRequest"
import { BlobServerAccessInfo, createBlobAccessTokenPostIn, createBlobReadData, createBlobWriteData, createInstanceId } from "../../entities/storage/TypeRefs"
import { getElementId, getEtId, getListId, isElementEntity } from "../../common/utils/EntityUtils.js"

assertWorkerOrNode()

/**
 * The BlobAccessTokenFacade requests blobAccessTokens from the BlobAccessTokenService to get or post to the BlobService (binary blobs)
 * or DefaultBlobElementResource (instances).
 *
 * Write access tokens are cached.
 * Read access tokens for archives are cached, but tokens for reading specific blobs are not cached.
 */
export class BlobAccessTokenFacade {
	// We avoid sending tokens that are just about to expire.
	private readonly TOKEN_EXPIRATION_MARGIN_MS = 1000

	private readonly serviceExecutor: IServiceExecutor
	private readonly readCache: Map<Id, BlobServerAccessInfo>
	private readonly writeCache: Map<ArchiveDataType, Map<Id, BlobServerAccessInfo>>

	constructor(serviceExecutor: IServiceExecutor) {
		this.serviceExecutor = serviceExecutor
		this.readCache = new Map<Id, BlobServerAccessInfo>()
		this.writeCache = new Map()
	}

	/**
	 * Requests a token to upload blobs for the given ArchiveDataType and ownerGroup.
	 * @param archiveDataType
	 * @param ownerGroupId
	 */
	async requestWriteToken(archiveDataType: ArchiveDataType, ownerGroupId: Id): Promise<BlobServerAccessInfo> {
		const cachedBlobServerAccessInfo = this.getValidTokenFromWriteCache(archiveDataType, ownerGroupId)
		if (cachedBlobServerAccessInfo != null) {
			return cachedBlobServerAccessInfo
		}
		const tokenRequest = createBlobAccessTokenPostIn({
			archiveDataType,
			write: createBlobWriteData({
				archiveOwnerGroup: ownerGroupId,
			}),
		})
		const { blobAccessInfo } = await this.serviceExecutor.post(BlobAccessTokenService, tokenRequest)
		this.putTokenIntoWriteCache(archiveDataType, ownerGroupId, blobAccessInfo)
		return blobAccessInfo
	}

	/**
	 * Requests a token to download blobs.
	 * @param archiveDataType
	 * @param blobs all blobs need to be in one archive.
	 * @param referencingInstance the instance that references the blobs
	 */
	async requestReadTokenBlobs(archiveDataType: ArchiveDataType, blobs: Blob[], referencingInstance: Instance): Promise<BlobServerAccessInfo> {
		const archiveId = this.getArchiveId(blobs)
		const instance = downcast(referencingInstance)
		let instanceListId: Id | null
		let instanceId: Id
		if (isElementEntity(instance)) {
			instanceListId = null
			instanceId = getEtId(instance)
		} else {
			instanceListId = getListId(instance)
			instanceId = getElementId(instance)
		}
		const instanceIds = [createInstanceId({ instanceId })]
		const tokenRequest = createBlobAccessTokenPostIn({
			archiveDataType,
			read: createBlobReadData({
				archiveId,
				instanceListId,
				instanceIds,
			}),
		})
		const { blobAccessInfo } = await this.serviceExecutor.post(BlobAccessTokenService, tokenRequest)
		return blobAccessInfo
	}

	/**
	 * Requests a token to download blobs.
	 * @param archiveDataType
	 * @param archiveId
	 */
	async requestReadTokenArchive(archiveDataType: ArchiveDataType, archiveId: Id): Promise<BlobServerAccessInfo> {
		const cachedBlobServerAccessInfo = this.readCache.get(archiveId)
		if (cachedBlobServerAccessInfo != null && this.isValid(cachedBlobServerAccessInfo)) {
			return cachedBlobServerAccessInfo
		}

		const tokenRequest = createBlobAccessTokenPostIn({
			archiveDataType,
			read: createBlobReadData({
				archiveId,
				instanceIds: [],
			}),
		})
		const { blobAccessInfo } = await this.serviceExecutor.post(BlobAccessTokenService, tokenRequest)
		this.readCache.set(archiveId, blobAccessInfo)
		return blobAccessInfo
	}

	private isValid(blobServerAccessInfo: BlobServerAccessInfo): boolean {
		return blobServerAccessInfo.expires.getTime() > Date.now() - this.TOKEN_EXPIRATION_MARGIN_MS
	}

	private getValidTokenFromWriteCache(archiveDataType: ArchiveDataType, ownerGroupId: Id): BlobServerAccessInfo | undefined {
		const cacheForArchiveDataType = this.writeCache.get(archiveDataType)
		if (cacheForArchiveDataType != null) {
			let cachedBlobServerAccessInfo = cacheForArchiveDataType.get(ownerGroupId)
			if (cachedBlobServerAccessInfo != null && this.isValid(cachedBlobServerAccessInfo)) {
				return cachedBlobServerAccessInfo
			}
		}
		return undefined
	}

	private putTokenIntoWriteCache(archiveDataType: ArchiveDataType, ownerGroupId: Id, blobServerAccessInfo: BlobServerAccessInfo) {
		const cacheForArchiveDataType = getFromMap(this.writeCache, archiveDataType, () => new Map())
		cacheForArchiveDataType.set(ownerGroupId, blobServerAccessInfo)
	}

	private getArchiveId(blobs: Blob[]) {
		if (blobs.length == 0) {
			throw new Error("must pass blobs")
		}
		let archiveIds = new Set(blobs.map((b) => b.archiveId))
		if (archiveIds.size != 1) {
			throw new Error(`only one archive id allowed, but was ${archiveIds}`)
		}
		return blobs[0].archiveId
	}
}
