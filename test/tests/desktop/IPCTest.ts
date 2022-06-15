import n from "../nodemocker.js"
import o from "ospec"
import {assertThrows} from "@tutao/tutanota-test-utils"
import {defer, delay, noOp} from "@tutao/tutanota-utils"
import {IPC} from "../../../src/desktop/IPC.js"
import type {Message} from "../../../src/api/common/MessageDispatcher.js"
import {Request, RequestError, Response} from "../../../src/api/common/MessageDispatcher.js"
import {DesktopConfig} from "../../../src/desktop/config/DesktopConfig.js";
import {WindowManager} from "../../../src/desktop/DesktopWindowManager.js";
import {Socketeer} from "../../../src/desktop/Socketeer.js";
import {DesktopDownloadManager} from "../../../src/desktop/DesktopDownloadManager.js";
import {ElectronUpdater} from "../../../src/desktop/ElectronUpdater.js";
import {DesktopUtils} from "../../../src/desktop/DesktopUtils.js";
import {DesktopIntegrator} from "../../../src/desktop/integration/DesktopIntegrator.js";
import {OfflineDbFacade} from "../../../src/desktop/db/OfflineDbFacade.js"
import {object} from "testdouble"
import {ExposedNativeInterface} from "../../../src/native/common/NativeInterface.js"
import {DesktopGlobalDispatcher} from "../../../src/native/common/generatedipc/DesktopGlobalDispatcher.js"

o.spec("IPC tests", function () {
	const CALLBACK_ID = "to-main"
	const WINDOW_ID = 42

	const dummyEvent = id => ({
		sender: {
			id,
		},
	})

	let electron
	const conf = {
		getVar: key => {
			if (key == "dummy") {
				return "value"
			}
		},
		setVar: () => Promise.resolve(),
		listeners: {},
		on: function (key, listener) {
			this.listeners[key] = this.listeners[key] || []
			this.listeners[key].push(listener)
		},
	}
	let windowMock
	const wm = {
		get: id => (id === 42 ? windowMock : null),
		getEventSender: ev => (ev.sender.id === 42 ? windowMock : null),
		newWindow: () => {
		},
	}
	const sock = {
		sendSocketMessage: () => {
		},
	}
	const fs = {}
	const desktopUtils = {
		registerAsMailtoHandler: () => {
			return Promise.resolve()
		},
		unregisterAsMailtoHandler: () => {
			return Promise.resolve()
		},
		checkIsMailtoHandler: () => Promise.resolve(true),
		getTutanotaTempPath: () => "/some/path"
	}
	const dl = {
		downloadNative: (url, file) => (file === "filename" ? Promise.resolve() : Promise.reject("DL error")),
		open: file => (file === "/file/to/open" ? Promise.resolve() : Promise.reject("Could not open!")),
		hashFile: file => (file === "/file/to/open" ? Promise.resolve() : Promise.reject("Could not open!")),
		joinFiles: (fileName, files) => (fileName === "fileName" ? Promise.resolve() : Promise.reject("Could not open!")),
		getSize: file => (file === "/file" ? Promise.resolve() : Promise.reject("Could not open!")),
	}
	const desktopIntegrator = {
		isAutoLaunchEnabled: () => Promise.resolve(true),
		enableAutoLaunch: () => Promise.resolve(),
		disableAutoLaunch: () => Promise.resolve(),
		isIntegrated: () => Promise.resolve(true),
		integrate: () => Promise.resolve(),
		unintegrate: () => Promise.resolve(),
	}
	const workerProtocol = {
		errorToObj: noOp,
	}
	const utils = {
		noOp: () => {
		},
		downcast: a => a,
		defer: defer,
	}
	const autoUpdater = {
		updateInfo: null,
		setUpdateDownloadedListener: () => {
		},
	}

	const standardMocks = () => {
		electron = {
			ipcMain: {
				callbacks: {},
				removeAllListeners: function (ev) {
					delete this.callbacks[ev]
				},
				on: function (ev, cb) {
					this.callbacks[ev] = cb
					return this
				},
				handle: function (msg, handler) {
					this.callbacks[msg] = handler
				},
			},
			app: {
				quit: () => {
				},
				getPath: () => "",
			},
			dialog: {
				showOpenDialog: (e, opts) =>
					Promise.resolve({
						filePaths: ["a", "list", "of", "paths"],
					}),
			},
			shell: {
				openItem: file => file === "/file/to/open",
			},
			nativeImage: {
				createFromPath: () => {
				},
			},
		}
		windowMock = n
			.mock("__window", {
				id: 42,
				sendMessageToWebContents: () => {
				},
				findInPage: () =>
					new Promise((resolve, reject) => {
						resolve({
							numberOfMatches: 37,
							currentMatch: 13,
						})
					}),
				stopFindInPage: () => {
				},
				show: () => {
				},
				setSearchOverlayState: () => {
				},
				setUserInfo: () => {
				},
				isHidden: () => false,
			})
			.set()
		const globalDispatcher = {}
		type ElectronMock = typeof import("electron") & {ipcMain: Electron.IpcMain & {callbacks: any}}
		return {
			electronMock: n.mock<ElectronMock>("electron", electron).set(),
			confMock: n.mock<DesktopConfig>("__conf", conf).set(),
			wmMock: n.mock<WindowManager>("__wm", wm).set(),
			sockMock: n.mock<Socketeer>("__sock", sock).set(),
			fsExtraMock: n.mock("fs-extra", fs).set(),
			desktopUtilsMock: n.mock<DesktopUtils>("../desktop/DesktopUtils", desktopUtils).set(),
			desktopIntegratorMock: n.mock<DesktopIntegrator>("./integration/DesktopIntegrator", desktopIntegrator).set(),
			workerProtocolMock: n.mock("../api/common/WorkerProtocol", workerProtocol).set(),
			dlMock: n.mock<DesktopDownloadManager>("__dl", dl).set(),
			utilsMock: n.mock("@tutao/tutanota-utils", utils).set(),
			autoUpdaterMock: n.mock<ElectronUpdater>("__updater", autoUpdater).set(),
			offlineDbFacadeMock: n.mock<OfflineDbFacade>("__offlineDbFacade", {}).set(),
			globalDispatcher: n.mock<DesktopGlobalDispatcher>("__desktopGlobalDispatcher", globalDispatcher).set()
		}
	}

	const setUpWithWindowAndInit = () => {
		const sm = standardMocks()
		const {
			electronMock,
			confMock,
			sockMock,
			wmMock,
			dlMock,
			autoUpdaterMock,
			desktopUtilsMock,
			desktopIntegratorMock,
			globalDispatcher
		} = sm
		const ipc = new IPC(
			confMock,
			wmMock,
			sockMock,
			dlMock,
			autoUpdaterMock,
			electronMock,
			desktopUtilsMock,
			desktopIntegratorMock,
			() => object<ExposedNativeInterface>(),
			globalDispatcher
		)
		o(electronMock.ipcMain.on.callCount).equals(0)
		ipc.addWindow(WINDOW_ID)
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "init",
			id: "id",
			value: [],
		})
		return Object.assign({}, sm, {
			ipc,
		})
	}

	o("addWindow & init & removeWindow", function (done) {
		const {ipc} = setUpWithWindowAndInit()
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(1)
			ipc.removeWindow(WINDOW_ID)
			let threw = false
			ipc.initialized(WINDOW_ID)
			   .catch(() => (threw = true))
			   .then(() => o(threw).equals(true))
			   .then(() => done())
		}, 10)
	})
	o("sendRequest", async function () {
		const {ipc, electronMock} = setUpWithWindowAndInit()
		o(windowMock.sendMessageToWebContents.callCount).equals(0)
		await ipc.initialized(WINDOW_ID)
		o(windowMock.sendMessageToWebContents.callCount).equals(1)
		const requestPromise = ipc.sendRequest(WINDOW_ID, "ipc", ["nothing", "useful"])
		await delay(10)
		o(windowMock.sendMessageToWebContents.callCount).equals(2)
		const request = windowMock.sendMessageToWebContents.args[0]
		o(request.requestType).equals("ipc")
		o(request.args).deepEquals(["nothing", "useful"])
		//simulate the window answering
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "response",
			id: request.id,
			value: ["some-response-value"],
		})
		o(await requestPromise).deepEquals(["some-response-value"])
	})
	o("sendRequest with requestError response", async function () {
		const {ipc, electronMock} = setUpWithWindowAndInit()
		await ipc.initialized(WINDOW_ID)
		const requestPromise = ipc.sendRequest(WINDOW_ID, "ipc", ["nothing", "useful"])
		await delay(10)
		o(windowMock.sendMessageToWebContents.callCount).equals(2)
		const request = windowMock.sendMessageToWebContents.args[0]
		o(request.requestType).equals("ipc")
		o(request.args).deepEquals(["nothing", "useful"])
		//simulate the window answering
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "requestError",
			error: {
				message: "err msg",
			},
			id: request.id,
		})
		const e = await assertThrows(Error, () => requestPromise)
		o(e?.message).equals("err msg")
	})
	o("findInPage, setSearchOverlayState & stopFindInPage", function (done) {
		const {electronMock} = setUpWithWindowAndInit()
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "findInPage",
			id: "id2",
			args: ["hello"],
		})
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(2)
			o(windowMock.findInPage.callCount).equals(1)
			o(windowMock.findInPage.args[0]).deepEquals(["hello"])
			o(toObject(windowMock.sendMessageToWebContents.args[0])).deepEquals({
				id: "id2",
				type: "response",
				value: {
					numberOfMatches: 37,
					currentMatch: 13,
				},
			})
			electronMock.ipcMain.callbacks[String(CALLBACK_ID)](dummyEvent(WINDOW_ID), {
				type: "request",
				requestType: "setSearchOverlayState",
				id: "id3",
				args: [true, false],
			})
		}, 10)
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(3)
			o(toObject(windowMock.sendMessageToWebContents.args[0])).deepEquals({
				id: "id3",
				type: "response",
				value: undefined,
			})
			o(windowMock.setSearchOverlayState.callCount).equals(1)
			o(windowMock.setSearchOverlayState.args[0]).equals(true)
			o(windowMock.setSearchOverlayState.args[1]).equals(false)
			electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
				type: "request",
				requestType: "stopFindInPage",
				id: "id4",
				args: [],
			})
		}, 20)
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(4)
			o(windowMock.stopFindInPage.callCount).equals(1)
			o(windowMock.stopFindInPage.args[0]).equals(undefined)
			done()
		}, 30)
	})
	o("findInPage on destroyed window doesn't error out", function (done) {
		const {ipc, electronMock} = setUpWithWindowAndInit()
		ipc.addWindow(1337)
		const de = dummyEvent(1337)
		electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
			type: "request",
			requestType: "init",
			id: "id",
			value: [],
		})
		electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
			type: "request",
			requestType: "findInPage",
			id: "id2",
			args: ["hello"],
		})
		setTimeout(() => {
			electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
				type: "request",
				requestType: "stopFindInPage",
				id: "id3",
				args: [],
			})
		}, 10)
		setTimeout(() => {
			done()
		}, 30)
	})
	o("register & unregister mailto", function (done) {
		const {ipc, electronMock, desktopUtilsMock} = setUpWithWindowAndInit()
		ipc.addWindow(WINDOW_ID)
		const de = dummyEvent(WINDOW_ID)
		electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
			type: "request",
			requestType: "init",
			id: "id",
			value: [],
		})
		electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
			type: "request",
			requestType: "registerMailto",
			id: "id2",
			args: [],
		})
		o(desktopUtilsMock.registerAsMailtoHandler.callCount).equals(1)
		setTimeout(() => {
			electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
				type: "request",
				requestType: "unregisterMailto",
				id: "id3",
				args: [],
			})
			o(desktopUtilsMock.unregisterAsMailtoHandler.callCount).equals(1)
			done()
		}, 10)
	})
	o("integrate & unintegrate desktop", function (done) {
		const {ipc, electronMock, desktopIntegratorMock} = setUpWithWindowAndInit()
		ipc.addWindow(WINDOW_ID)
		const de = dummyEvent(WINDOW_ID)
		electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
			type: "request",
			requestType: "init",
			id: "id",
			value: [],
		})
		electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
			type: "request",
			requestType: "integrateDesktop",
			id: "id2",
			args: [],
		})
		o(desktopIntegratorMock.integrate.callCount).equals(1)
		o(desktopIntegratorMock.integrate.args[0]).equals(undefined)
		setTimeout(() => {
			electronMock.ipcMain.callbacks[CALLBACK_ID](de, {
				type: "request",
				requestType: "unIntegrateDesktop",
				id: "id3",
				args: [],
			})
			o(desktopIntegratorMock.unintegrate.callCount).equals(1)
			o(desktopIntegratorMock.unintegrate.args[0]).equals(undefined)
			done()
		}, 10)
	})
	o("getConfigValue", function (done) {
		const {electronMock} = setUpWithWindowAndInit()
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "getConfigValue",
			id: "id2",
			args: ["dummy"],
		})
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(3)
			o(toObject(windowMock.sendMessageToWebContents.calls.find(c => c.args[0].id === "id2").args[0])).deepEquals(
				{
					id: "id2",
					type: "response",
					value: "value",
				},
			)
			done()
		}, 10)
	})
	o("getIntegrationInfo", function (done) {
		const {electronMock, autoUpdaterMock, desktopUtilsMock, desktopIntegratorMock} = setUpWithWindowAndInit()
		;(autoUpdaterMock as any).updateInfo = {}
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "getIntegrationInfo",
			id: "id2",
			args: [],
		})
		setTimeout(() => {
			o(desktopUtilsMock.checkIsMailtoHandler.callCount).equals(1)
			o(desktopIntegratorMock.isAutoLaunchEnabled.callCount).equals(1)
			o(desktopIntegratorMock.isIntegrated.callCount).equals(1)
			o(toObject(windowMock.sendMessageToWebContents.calls.find(c => c.args[0].id === "id2").args[0])).deepEquals(
				{
					id: "id2",
					type: "response",
					value: {
						isMailtoHandler: true,
						isAutoLaunchEnabled: true,
						isIntegrated: true,
						isUpdateAvailable: true,
					},
				},
			)
			done()
		}, 10)
	})
	o("setConfigValue", function (done) {
		const {electronMock, confMock} = setUpWithWindowAndInit()
		// open file dialog gets ignored
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "setConfigValue",
			id: "id2",
			args: ["more", "stuff"],
		})
		o(confMock.setVar.callCount).equals(1)
		o(confMock.setVar.args[0]).equals("more")
		o(confMock.setVar.args[1]).deepEquals("stuff")
		setTimeout(() => {
			o(toObject(windowMock.sendMessageToWebContents.calls.find(c => c.args[0].id === "id2").args[0])).deepEquals(
				{
					id: "id2",
					type: "response",
					value: undefined,
				},
			)
			done()
		}, 10)
	})
	o("openNewWindow", function (done) {
		const {electronMock, wmMock} = setUpWithWindowAndInit()
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "openNewWindow",
			id: "id2",
			args: [],
		})
		o(wmMock.newWindow.callCount).equals(1)
		o(wmMock.newWindow.args[0]).equals(true)
		o(wmMock.newWindow.args.length).equals(1)
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(2)
			o(toObject(windowMock.sendMessageToWebContents.args[0])).deepEquals({
				id: "id2",
				type: "response",
				value: undefined,
			})
			done()
		}, 10)
	})
	o("enableAutoLaunch & disableAutoLaunch", function (done) {
		const {electronMock, desktopIntegratorMock} = setUpWithWindowAndInit()
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "enableAutoLaunch",
			id: "id2",
			args: [],
		})
		setTimeout(() => {
			o(desktopIntegratorMock.enableAutoLaunch.callCount).equals(1)
			o(desktopIntegratorMock.enableAutoLaunch.length).equals(0)
			o(windowMock.sendMessageToWebContents.callCount).equals(2)
			o(toObject(windowMock.sendMessageToWebContents.args[0])).deepEquals({
				id: "id2",
				type: "response",
				value: undefined,
			})
			// trigger error
			electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
				type: "request",
				requestType: "disableAutoLaunch",
				id: "id3",
				args: [],
			})
		}, 10)
		setTimeout(() => {
			o(desktopIntegratorMock.disableAutoLaunch.callCount).equals(1)
			o(desktopIntegratorMock.disableAutoLaunch.args.length).equals(0)
			o(windowMock.sendMessageToWebContents.callCount).equals(3)
			o(toObject(windowMock.sendMessageToWebContents.args[0])).deepEquals({
				id: "id3",
				type: "response",
				value: undefined,
			})
			done()
		}, 20)
	})
	o("sendSocketMessage", function (done) {
		const {electronMock, sockMock} = setUpWithWindowAndInit()
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "sendSocketMessage",
			id: "id2",
			args: ["thisIsASocketMessage"],
		})
		setTimeout(() => {
			o(sockMock.sendSocketMessage.callCount).equals(1)
			o(sockMock.sendSocketMessage.args[0]).equals("thisIsASocketMessage")
			o(sockMock.sendSocketMessage.args.length).equals(1)
			o(windowMock.sendMessageToWebContents.callCount).equals(2)
			o(toObject(windowMock.sendMessageToWebContents.args[0])).deepEquals({
				id: "id2",
				type: "response",
				value: undefined,
			})
			done()
		}, 10)
	})
	o("invalid method invocation gets rejected", function (done) {
		const {electronMock} = setUpWithWindowAndInit()
		electronMock.ipcMain.callbacks[CALLBACK_ID](dummyEvent(WINDOW_ID), {
			type: "request",
			requestType: "invalid",
			id: "id2",
			args: [1, 2, 3],
		})
		setTimeout(() => {
			o(windowMock.sendMessageToWebContents.callCount).equals(2)
			const arg = windowMock.sendMessageToWebContents.args[0]
			o(arg.id).equals("id2")
			o(arg.type).equals("requestError")
			o(typeof arg.error).equals("object")
			done()
		}, 10)
	})
})

function emptyError() {
	return {
		name: undefined,
		message: undefined,
		stack: undefined,
		data: undefined,
	}
}

function toObject<T>(message: Message<T>): any {
	if (message instanceof Request) {
		return {
			type: "request",
			requestType: message.requestType,
			id: message.id,
			args: message.args,
		}
	} else if (message instanceof RequestError) {
		return {
			type: "requestError",
			id: message.id,
			error: message.error,
		}
	} else if (message instanceof Response) {
		return {
			type: "response",
			id: message.id,
			value: message.value,
		}
	} else {
		throw new Error("wrong type " + message)
	}
}