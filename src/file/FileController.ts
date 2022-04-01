import {Dialog} from "../gui/base/Dialog"
import {convertToDataFile, createDataFile, DataFile} from "../api/common/DataFile"
import {assertMainOrNode, isAndroidApp, isApp, isDesktop} from "../api/common/Env"
import {assertNotNull, isNotNull, neverNull, noOp, ofClass, promiseMap, sortableTimestamp} from "@tutao/tutanota-utils"
import {showProgressDialog} from "../gui/dialogs/ProgressDialog"
import {CryptoError} from "../api/common/error/CryptoError"
import {lang, TranslationKey} from "../misc/LanguageViewModel"
import {BrowserType} from "../misc/ClientConstants"
import {client} from "../misc/ClientDetector"
import {ConnectionError} from "../api/common/error/RestError"
import type {File as TutanotaFile} from "../api/entities/tutanota/File"
import {deduplicateFilenames, FileReference, sanitizeFilename} from "../api/common/utils/FileUtils"
import {CancelledError} from "../api/common/error/CancelledError"
import {locator} from "../api/main/MainLocator"
import type {NativeFileApp} from "../native/common/FileApp"

assertMainOrNode()
export const CALENDAR_MIME_TYPE = "text/calendar"

export class FileController {

	private get fileApp(): NativeFileApp {
		return assertNotNull(this._fileApp)
	}

	constructor(
		private readonly _fileApp: NativeFileApp | null
	) {
	}

	/**
	 * Temporary files are deleted afterwards in apps.
	 */
	downloadAndOpen(tutanotaFile: TutanotaFile, open: boolean): Promise<void> {
		const fileFacade = locator.fileFacade
		const downloadPromise = Promise.resolve().then(async () => {
			if (isApp()) {
				let file

				try {
					file = await fileFacade.downloadFileContentNative(tutanotaFile)

					if (isAndroidApp() && !open) {
						await this.fileApp.putFileIntoDownloadsFolder(file.location)
					} else {
						await this.open(file)
					}
				} finally {
					if (file) {
						this.deleteFile(file.location)
					}
				}
			} else if (isDesktop()) {
				const file = open ? await fileFacade.downloadFileContentNative(tutanotaFile) : await fileFacade.downloadFileContent(tutanotaFile)
				await this.open(file)
			} else {
				const file = await fileFacade.downloadFileContent(tutanotaFile)
				await this.open(file)
			}
		})
		return showProgressDialog("pleaseWait_msg", downloadPromise.then(noOp))
			.catch(
				ofClass(CryptoError, e => {
					console.log(e)
					return Dialog.message("corrupted_msg")
				}),
			)
			.catch(
				ofClass(ConnectionError, e => {
					console.log(e)
					return Dialog.message("couldNotAttachFile_msg")
				}),
			)
	}

	/**
	 * Temporary files are deleted afterwards in apps.
	 */
	async downloadAll(tutanotaFiles: Array<TutanotaFile>): Promise<void> {
		const showErr = (msg: TranslationKey, name: string) => Dialog.message(() => lang.get(msg) + " " + name).then(() => null)

		const fileFacade = locator.fileFacade

		if (isAndroidApp()) {
			const fileResults = await promiseMap(
				tutanotaFiles,
				(f) =>
					fileFacade.downloadFileContentNative(f)
							  .catch(ofClass(CryptoError, () => showErr("corrupted_msg", f.name)))
							  .catch(ofClass(ConnectionError, () => showErr("couldNotAttachFile_msg", f.name))),
				{concurrency: 1}
			)
			const files = fileResults.filter(isNotNull)
			for (const file of files) {
				await this.fileApp.putFileIntoDownloadsFolder(file.location)
			}
		} else if (isApp()) {
			const fileResults = await promiseMap(
				tutanotaFiles,
				(f) =>
					fileFacade.downloadFileContentNative(f)
							  .catch(ofClass(CryptoError, () => showErr("corrupted_msg", f.name)))
							  .catch(ofClass(ConnectionError, () => showErr("couldNotAttachFile_msg", f.name))),
				{concurrency: 1}
			)
			const files = fileResults.filter(isNotNull)
			for (const file of files) {
				await this.openFileReference(file).finally(() => this.deleteFile(file.location))
			}
		} else {
			const fileResults = await promiseMap(
				tutanotaFiles,
				(f) =>
					fileFacade.downloadFileContent(f)
							  .catch(ofClass(CryptoError, () => showErr("corrupted_msg", f.name)))
							  .catch(ofClass(ConnectionError, () => showErr("couldNotAttachFile_msg", f.name))),
				{concurrency: 1}
			)
			const files = fileResults.filter(isNotNull)
			const zip = await this.zipDataFiles(files, `${sortableTimestamp()}-attachments.zip`)
			await this.openDataFile(zip)
		}
	}

	/**
	 * @param allowedExtensions Array of extensions strings without "."
	 */
	showFileChooser(multiple: boolean, allowedExtensions?: Array<string>): Promise<Array<DataFile>> {
		// each time when called create a new file chooser to make sure that the same file can be selected twice directly after another
		// remove the last file input
		const fileInput = document.getElementById("hiddenFileChooser")
		const body = neverNull(document.body)

		if (fileInput) {
			// remove the old one because it may contain a file already
			body.removeChild(fileInput)
		}

		const newFileInput = document.createElement("input")
		newFileInput.setAttribute("type", "file")

		if (multiple) {
			newFileInput.setAttribute("multiple", "multiple")
		}

		newFileInput.setAttribute("id", "hiddenFileChooser")

		if (allowedExtensions) {
			newFileInput.setAttribute("accept", allowedExtensions.map(e => "." + e).join(","))
		}

		newFileInput.style.display = "none"
		let promise = new Promise(resolve => {
			newFileInput.addEventListener("change", (e: Event) => {
				this.readLocalFiles((e.target as any).files)
					.then(dataFiles => {
						resolve(dataFiles)
					})
					.catch(e => {
						console.log(e)
						return Dialog.message("couldNotAttachFile_msg").then(() => {
							resolve([])
						})
					})
			})
		})
		// the file input must be put into the dom, otherwise it does not work in IE
		body.appendChild(newFileInput)
		newFileInput.click()
		return promise as Promise<Array<DataFile>>
	}

	readLocalFiles(fileList: FileList): Promise<Array<DataFile>> {
		// create an array of files form the FileList because we can not iterate the FileList directly
		let nativeFiles: File[] = []

		for (let i = 0; i < fileList.length; i++) {
			nativeFiles.push(fileList[i])
		}

		return promiseMap(
			nativeFiles,
			nativeFile => {
				return new Promise((resolve, reject) => {
					let reader = new FileReader()

					reader.onloadend = function (evt: ProgressEvent) {
						const target: any = evt.target

						if (target.readyState === reader.DONE && target.result) {
							// DONE == 2
							resolve(convertToDataFile(nativeFile, new Uint8Array(target.result)))
						} else {
							reject(new Error("could not load file"))
						}
					}

					reader.readAsArrayBuffer(nativeFile)
				})
			},
			{
				concurrency: 5,
			},
		)
	}

	private openFileReference(file: FileReference): Promise<void> {
		return this.fileApp.open(file)
	}

	async openDataFile(dataFile: DataFile): Promise<void> {

		if (isApp() || isDesktop()) {
			// For apps "opening" blob currently means saving it. This is not logical but we need to check all cases before changing this.
			await this.saveBlobNative(dataFile)
			return
		}

		try {
			const URL = window.URL || window.webkitURL || window.mozURL || window.msURL

			// Workaround for new behaviour in firefox 98 where PDF attachments open in the same tab by default
			// Users can always change their settings to "always ask" or somesuch, but it's very not nice for this to happen at all
			// because the app gets clobbered, logging users out as well as losing their non-persistent sessions
			// There is a bug report: https://bugzilla.mozilla.org/show_bug.cgi?id=1756980
			// It is unclear whether this will be fixed on the firefox side as it seems that they consider it to be expected behaviour
			// Maybe it will gain enough traction that it will be reverted
			// It's unclear to me why target=_blank is being ignored. If there is a way to ensure that it always opens a new tab,
			// Then we should do that instead of this, because it's preferable to keep the mime type.
			const needsPdfWorkaround = dataFile.mimeType === "application/pdf"
				&& client.browser === BrowserType.FIREFOX
				&& client.browserVersion >= 98

			const mimeType = needsPdfWorkaround
				? "application/octet-stream"
				: dataFile.mimeType

			const blob = new Blob([dataFile.data], {type: mimeType,})
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")

			if (typeof a.download !== "undefined") {
				a.href = url
				a.download = dataFile.name
				a.style.display = "none"
				a.target = "_blank"
				document.body.appendChild(a)
				a.click()
				document.body.removeChild(a)
				// Do not revoke object URL right away so that the browser has a chance to open it
				setTimeout(() => {
					window.URL.revokeObjectURL(url)
				}, 2000)
			} else {
				if (client.isIos() && client.browser === BrowserType.CHROME && typeof FileReader === "function") {

					const reader = new FileReader()

					const downloadPromise = new Promise(resolve => {
						reader.onloadend = async function () {
							const url = reader.result as any
							resolve(await Dialog.legacyDownload(dataFile.name, url))
						}
					})

					reader.readAsDataURL(blob)
					await downloadPromise
				} else {
					// if the download attribute is not supported try to open the link in a new tab.
					await Dialog.legacyDownload(dataFile.name, url)
				}
			}
		} catch (e) {
			console.log(e)
			return Dialog.message("canNotOpenFileOnDevice_msg")
		}
	}

	private async saveBlobNative(dataFile: DataFile) {
		try {
			await this.fileApp.saveBlob(dataFile)
		} catch (e) {
			if (e instanceof CancelledError) {
				// no-op. User cancelled file dialog
				console.log("saveBlob cancelled")
			} else {
				console.warn("openDataFile failed", e)
				Dialog.message("canNotOpenFileOnDevice_msg")
			}
		}
	}

	/**
	 * take a file location in the form of
	 *   * a uri like file:///home/user/cat.jpg
	 *   * an absolute file path like C:\Users\cat.jpg
	 * and return a DataFile populated
	 * with data and metadata of that file on disk.
	 *
	 * returns null
	 *   * if not invoked in desktop client
	 *     * browser doesn't have access to disk
	 *     * apps use FileRefs
	 *   * if file can't be opened for any reason
	 *   * if path is not absolute
	 */
	async getDataFile(uriOrPath: string): Promise<DataFile | null> {
		if (!isDesktop()) return null
		return this.fileApp.readDataFile(uriOrPath)
	}

	/**
	 * Does not delete temporary file in app.
	 */
	open(file: DataFile | FileReference): Promise<void> {
		if (file._type === "FileReference") {
			return this.openFileReference(file)
		} else {
			return this.openDataFile(file)
		}
	}

	private deleteFile(filePath: string) {
		if (isApp()) {
			this.fileApp.deleteFile(filePath).catch(e => console.log("failed to delete file", filePath, e))
		}
	}

	/**
	 * takes a list of DataFiles and creates one DataFile from them that represents a zip
	 * containing the the other files
	 *
	 * currently waits on all DataFiles being available before starting to add them to the zip.
	 * It may be even faster to create the zip asap and adding the datafiles as they resolve.
	 *
	 * duplicate file names lead to the second file added overwriting the first one.
	 *
	 * @param dataFiles Promise resolving to an array of DataFiles
	 * @param name the name of the new zip file
	 */
	zipDataFiles(dataFiles: Array<DataFile>, name: string): Promise<DataFile> {
		return import("jszip")
			.then(jsZip => {
				const zip = jsZip.default()
				// fileName should already be sanitized anyway
				const deduplicatedMap = deduplicateFilenames(dataFiles.map(df => sanitizeFilename(df.name)))

				for (let file of dataFiles) {
					const filename = assertNotNull(deduplicatedMap[file.name].shift())
					zip.file(sanitizeFilename(filename), file.data, {
						binary: true,
					})
				}

				return zip.generateAsync({
					type: "uint8array",
				})
			})
			.then((zipData: Uint8Array) => createDataFile(name, "application/zip", zipData))
	}
}