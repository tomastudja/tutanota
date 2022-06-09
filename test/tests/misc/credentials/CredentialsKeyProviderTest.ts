import o from "ospec"
import {CredentialsKeyProvider} from "../../../../src/misc/credentials/CredentialsKeyProvider.js"
import n from "../../nodemocker.js"
import {CredentialEncryptionMode} from "../../../../src/misc/credentials/CredentialEncryptionMode.js"
import type {DeviceEncryptionFacade} from "../../../../src/api/worker/facades/DeviceEncryptionFacade.js"
import {uint8ArrayToBase64} from "@tutao/tutanota-utils"
import type {CredentialsStorage} from "../../../../src/misc/credentials/CredentialsProvider.js"
import type {NativeInterface} from "../../../../src/native/common/NativeInterface.js"

o.spec("CredentialsKeyProviderTest", function () {
	let credentialEncryptionMode: CredentialEncryptionMode
	let encryptedCredentialsKey: Uint8Array | null
	const generatedKey = new Uint8Array([1, 2, 3])

	let credentialsProvider: CredentialsKeyProvider
	let nativeWrapper: NativeInterface
	let credentialsStorage: CredentialsStorage
	let deviceEncryptionFacade: DeviceEncryptionFacade

	o.beforeEach(function () {
		credentialEncryptionMode = CredentialEncryptionMode.DEVICE_LOCK
		encryptedCredentialsKey = null

		nativeWrapper = n.mock<NativeInterface>("aaaaa", {
			async invokeNative(request, args) {
				if (request === "decryptUsingKeychain") {
					const credentialsKey = args[1]
					return credentialsKey
				} else if (request === "encryptUsingKeychain") {
					const credentialsKey = args[1]
					return credentialsKey
				} else {
					throw new Error("stub! " + request)
				}
			}
		}).set()
		credentialsStorage = n.mock<CredentialsStorage>("baloons", {
			getCredentialsEncryptionKey() {
				return encryptedCredentialsKey
			},
			setCredentialsEncryptionKey() {

			},
			getCredentialEncryptionMode() {
				return credentialEncryptionMode
			}
		}).set()
		deviceEncryptionFacade = n.mock<DeviceEncryptionFacade>("grob", {
			async generateKey() {
				return generatedKey
			}
		}).set()
		credentialsProvider = new CredentialsKeyProvider(nativeWrapper, credentialsStorage, deviceEncryptionFacade)
	})

	o.spec("getCredentialsKey", function () {
		o("if key does exist it shall be decrypted", async function () {
			encryptedCredentialsKey = new Uint8Array([1, 2, 6, 9])
			const key = encryptedCredentialsKey

			const returnedKey = await credentialsProvider.getCredentialsKey()

			o(Array.from(returnedKey)).deepEquals(Array.from(key))

			const request = nativeWrapper.invokeNative.args
			o(request[0]).equals("decryptUsingKeychain")
			o(request[1]).deepEquals([credentialEncryptionMode, uint8ArrayToBase64(key)])
		})

		o("if key does not exist it shall be generated and saved", async function () {
			encryptedCredentialsKey = null

			const returnedKey = await credentialsProvider.getCredentialsKey()

			o(Array.from(returnedKey)).deepEquals(Array.from(generatedKey))

			const request = nativeWrapper.invokeNative.args
			o(request[0]).equals("encryptUsingKeychain")
			o(request[1]).deepEquals([credentialEncryptionMode, uint8ArrayToBase64(generatedKey)])
			o(Array.from(credentialsStorage.setCredentialsEncryptionKey.args[0])).deepEquals(Array.from(generatedKey))
		})
	})
})