// @flow

import o from "ospec/ospec.js"
import n from "../../nodemocker"

o.spec("AutoLauncher Test", () => {
	n.startGroup({
		group: __filename,
		allowables: [
			'./DesktopIntegratorLinux.js',
			'./DesktopIntegratorDarwin.js',
			'./DesktopIntegratorWin32.js',
		],
		cleanupFunctions: [() => resetFsExtra()]
	})

	const lang = {
		lang: {get: key => key}
	}
	const cp = {
		exec: () => {}
	}

	const electron = {
		app: {
			name: "appName",
			getLoginItemSettings() {return {openAtLogin: false}},
			setLoginItemSettings() {},
			getPath() {return "/app/path/file"},
			getVersion() {return "appVersion"}
		},
		dialog: {
			showMessageBox: () => Promise.resolve({response: 1, checkboxChecked: false})
		}
	}
	const fsExtra = {
		writtenFiles: [],
		copiedFiles: [],
		ensureDirSync() {},
		writeFileSync(file, content, opts) {
			this.writtenFiles.push({file, content, opts})
		},
		copyFileSync(from, to) {
			this.copiedFiles.push({from, to})
		},
		readFileSync: () => "",
		unlink(path, cb) {setImmediate(cb)},
		access: (p, f) => {
			console.log(p, f)
			return Promise.reject(new Error('nope'))
		},
		constants: {
			F_OK: 0,
			W_OK: 1,
			R_OK: 2
		}
	}
	const resetFsExtra = () => {
		fsExtra.writtenFiles = []
		fsExtra.copiedFiles = []
	}

	let itemToReturn = undefined
	const winreg = n.classify({
		prototype: {
			get(key, cb) {setImmediate(() => cb(null, itemToReturn))},
			set(key, reg, val, cb) { setImmediate(() => cb(null))},
			remove(key, cb) {setImmediate(() => cb(null))}
		},
		statics: {}
	})

	const standardMocks = () => {
		// node modules
		const electronMock = n.mock('electron', electron).set()
		const fsExtraMock = n.mock('fs-extra', fsExtra).set()
		const winregMock = n.mock('winreg', winreg).set()
		const langMock = n.mock("../../misc/LanguageViewModel", lang).set()
		const cpMock = n.mock("child_process", cp).set()

		return {
			electronMock,
			fsExtraMock,
			winregMock,
			langMock,
			cpMock
		}
	}

	o("Darwin enable when off", done => {
		n.setPlatform('darwin')
		const {electronMock} = standardMocks()
		const {enableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		;(async function () {
			await enableAutoLaunch()

			o(electronMock.app.getLoginItemSettings.callCount).equals(1)
			o(electronMock.app.setLoginItemSettings.callCount).equals(1)

			o(electronMock.app.setLoginItemSettings.args.length).equals(1)
			o(electronMock.app.setLoginItemSettings.args[0]).deepEquals({openAtLogin: true})

			done()
		})()
	})

	o("Darwin disable when off", done => {
		n.setPlatform('darwin')
		const {electronMock} = standardMocks()
		const {disableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		;(async function () {
			await disableAutoLaunch()

			o(electronMock.app.getLoginItemSettings.callCount).equals(1)
			o(electronMock.app.setLoginItemSettings.callCount).equals(0)

			done()
		})()
	})

	o("Darwin enable when on", done => {
		n.setPlatform('darwin')
		const electronMock = n.mock('electron', electron).with({
			app: {
				getLoginItemSettings() {return {openAtLogin: true}}
			}
		}).set()
		const {enableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		;(async function () {
			await enableAutoLaunch()

			o(electronMock.app.getLoginItemSettings.callCount).equals(1)
			o(electronMock.app.setLoginItemSettings.callCount).equals(0)

			done()
		})()
	})

	o("Darwin disable when on", done => {
		n.setPlatform('darwin')
		const electronMock = n.mock('electron', electron).with({
			app: {
				getLoginItemSettings() {return {openAtLogin: true}}
			}
		}).set()
		const {disableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		;(async function () {
			await disableAutoLaunch()

			o(electronMock.app.getLoginItemSettings.callCount).equals(1)
			o(electronMock.app.setLoginItemSettings.callCount).equals(1)

			o(electronMock.app.setLoginItemSettings.args.length).equals(1)
			o(electronMock.app.setLoginItemSettings.args[0]).deepEquals({openAtLogin: false})

			done()
		})()
	})

	o("Linux enable when off", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = "appimagepath"
		const {fsExtraMock} = standardMocks()
		const {enableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await enableAutoLaunch()

			o(fsExtraMock.writeFileSync.callCount).equals(1)
			o(fsExtraMock.writeFileSync.args.length).equals(3)
			o(fsExtraMock.writeFileSync.args[0]).equals("/app/path/file/.config/autostart/appName.desktop")
			o(fsExtraMock.writeFileSync.args[1]).equals('[Desktop Entry]\n\tType=Application\n\tVersion=appVersion\n\tName=appName\n\tComment=appName startup script\n\tExec=appimagepath -a\n\tStartupNotify=false\n\tTerminal=false')
			o(fsExtraMock.writeFileSync.args[2]).deepEquals({encoding: 'utf-8'})

			o(fsExtraMock.ensureDirSync.callCount).equals(1)
			o(fsExtraMock.ensureDirSync.args.length).equals(1)
			o(fsExtraMock.ensureDirSync.args[0]).equals("/app/path/file/.config/autostart")

			done()
		})()
	})

	o("Linux disable when off", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = "appimagepath"
		const {fsExtraMock} = standardMocks()
		const {disableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await disableAutoLaunch()
			o(fsExtraMock.unlink.callCount).equals(0)
			done()
		})()
	})

	o("Linux enable when on", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = "appimagepath"
		standardMocks()
		const fsExtraMock = n.mock('fs-extra', fsExtra).with({
			access: (path, mode) => Promise.resolve()
		}).set()
		const {enableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await enableAutoLaunch()
			o(fsExtraMock.writeFileSync.callCount).equals(0)
			done()
		})()
	})

	o("Linux disable when on", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = "appimagepath"
		standardMocks()
		const fsExtraMock = n.mock('fs-extra', fsExtra).with({
			access: () => Promise.resolve()
		}).set()
		const {disableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await disableAutoLaunch()
			o(fsExtraMock.unlink.callCount).equals(1)
			o(fsExtraMock.unlink.args.length).equals(2)
			o(fsExtraMock.unlink.args[0]).equals('/app/path/file/.config/autostart/appName.desktop')
			done()
		})()
	})

	o("Win32 enable when off", done => {
		n.setPlatform('win32')
		const {winregMock} = standardMocks()
		const {enableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await enableAutoLaunch()
			o(winregMock.mockedInstances.length).equals(1)
			const regInst = winregMock.mockedInstances[0]
			o(regInst.get.callCount).equals(1)
			o(regInst.get.args.length).equals(2)
			o(regInst.get.args[0]).equals("appName")

			o(regInst.set.callCount).equals(1)
			o(regInst.set.args.length).equals(4)
			o(regInst.set.args[0]).equals('appName')
			o(regInst.set.args[2]).equals(`${process.execPath} -a`)
			done()
		})()
	})

	o("Win32 disable when off", done => {
		n.setPlatform('win32')
		const {winregMock} = standardMocks()
		const {disableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await disableAutoLaunch()
			o(winregMock.mockedInstances.length).equals(1)
			const regInst = winregMock.mockedInstances[0]
			o(regInst.get.callCount).equals(1)
			o(regInst.get.args.length).equals(2)
			o(regInst.get.args[0]).equals("appName")

			o(regInst.set.callCount).equals(0)
			o(regInst.remove.callCount).equals(0)
			done()
		})()
	})

	o("Win32 enable when on", done => {
		n.setPlatform('win32')
		itemToReturn = "not undefined"
		const {winregMock} = standardMocks()
		const {enableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await enableAutoLaunch()
			o(winregMock.mockedInstances.length).equals(1)
			const regInst = winregMock.mockedInstances[0]

			o(regInst.set.callCount).equals(0)
			o(regInst.remove.callCount).equals(0)
			done()
		})()
	})

	o("Win32 disable when on", done => {
		n.setPlatform('win32')
		itemToReturn = "not undefined"
		const {winregMock} = standardMocks()
		const {disableAutoLaunch} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")

		;(async function () {
			await disableAutoLaunch()
			o(winregMock.mockedInstances.length).equals(1)
			const regInst = winregMock.mockedInstances[0]

			o(regInst.set.callCount).equals(0)
			o(regInst.remove.callCount).equals(1)
			o(regInst.remove.args.length).equals(2)
			o(regInst.remove.args[0]).equals("appName")
			done()
		})()
	})

	o("runIntegration without integration, clicked yes, no no_integration, not checked", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {electronMock, fsExtraMock} = standardMocks()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(fsExtraMock.access.callCount).equals(3)
			o(electronMock.dialog.showMessageBox.callCount).equals(1)
			o(electronMock.dialog.showMessageBox.args.length).equals(2)
			o(electronMock.dialog.showMessageBox.args[0]).equals(null)
			o(electronMock.dialog.showMessageBox.args[1]).deepEquals({
				title: 'desktopIntegration_label',
				buttons: ['no_label', 'yes_label'],
				defaultId: 1,
				message: 'desktopIntegration_msg',
				checkboxLabel: 'doNotAskAgain_label',
				checkboxChecked: false,
				type: 'question'
			})
			o(fsExtraMock.ensureDirSync.callCount).equals(1)
			o(fsExtraMock.ensureDirSync.args.length).equals(1)
			o(fsExtraMock.ensureDirSync.args[0]).equals("/app/path/file/.local/share/applications")
			o(fsExtraMock.writtenFiles).deepEquals([
				{
					file: '/app/path/file/.local/share/applications/appName.desktop',
					content: '[Desktop Entry]\nName=Tutanota Desktop\nComment=The desktop client for Tutanota, the secure e-mail service.\nExec="/appimage/path/file.appImage" %U\nTerminal=false\nType=Application\nIcon=appName.png\nStartupWMClass=de.tutao.appName\nMimeType=x-scheme-handler/mailto;\nCategories=Network;\nX-Tutanota-Version=appVersion\nTryExec=/appimage/path/file.appImage',
					opts: {encoding: 'utf-8'}
				}
			])
			o(fsExtraMock.copiedFiles).deepEquals([
				{
					from: '/opt/node-v10.11.0-linux-x64/bin/resources/icons/logo-solo-red-small.png',
					to: '/app/path/file/.local/share/icons/hicolor/64x64/apps/appName.png'
				},
				{
					from: '/opt/node-v10.11.0-linux-x64/bin/resources/icons/logo-solo-red.png',
					to: '/app/path/file/.local/share/icons/hicolor/512x512/apps/appName.png'
				}
			])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})

	o("runIntegration without integration, clicked yes, no no_integration, checked", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {fsExtraMock} = standardMocks()
		const electronMock = n.mock("electron", electron).with({
			dialog: {
				showMessageBox: () => Promise.resolve({response: 1, checkboxChecked: true})
			}
		}).set()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(fsExtraMock.access.callCount).equals(3)
			o(fsExtraMock.ensureDirSync.callCount).equals(2)
			o(fsExtraMock.ensureDirSync.args.length).equals(1)
			o(fsExtraMock.ensureDirSync.args[0]).equals("/app/path/file/.local/share/applications")
			o(fsExtraMock.writtenFiles).deepEquals([
				{
					file: '/app/path/file/.config/tuta_integration/no_integration',
					content: '/appimage/path/file.appImage\n',
					opts: {encoding: 'utf-8', flag: 'a'}
				}, {
					file: '/app/path/file/.local/share/applications/appName.desktop',
					content: '[Desktop Entry]\nName=Tutanota Desktop\nComment=The desktop client for Tutanota, the secure e-mail service.\nExec="/appimage/path/file.appImage" %U\nTerminal=false\nType=Application\nIcon=appName.png\nStartupWMClass=de.tutao.appName\nMimeType=x-scheme-handler/mailto;\nCategories=Network;\nX-Tutanota-Version=appVersion\nTryExec=/appimage/path/file.appImage',
					opts: {encoding: 'utf-8'}
				}
			])
			o(fsExtraMock.copiedFiles).deepEquals([
				{
					from: '/opt/node-v10.11.0-linux-x64/bin/resources/icons/logo-solo-red-small.png',
					to: '/app/path/file/.local/share/icons/hicolor/64x64/apps/appName.png'
				},
				{
					from: '/opt/node-v10.11.0-linux-x64/bin/resources/icons/logo-solo-red.png',
					to: '/app/path/file/.local/share/icons/hicolor/512x512/apps/appName.png'
				}
			])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})

	o("runIntegration without integration, clicked no, not checked", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {fsExtraMock} = standardMocks()
		const electronMock = n.mock("electron", electron).with({
			dialog: {
				showMessageBox: () => Promise.resolve({response: 0, checkboxChecked: false})
			}
		}).set()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(fsExtraMock.access.callCount).equals(3)
			o(fsExtraMock.ensureDirSync.callCount).equals(0)
			o(fsExtraMock.writtenFiles).deepEquals([])
			o(fsExtraMock.copiedFiles).deepEquals([])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})

	o("runIntegration without integration, clicked no, checked", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {fsExtraMock} = standardMocks()
		const electronMock = n.mock("electron", electron).with({
			dialog: {
				showMessageBox: () => Promise.resolve({response: 0, checkboxChecked: true})
			}
		}).set()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(fsExtraMock.access.callCount).equals(3)
			o(fsExtraMock.ensureDirSync.callCount).equals(1)
			o(fsExtraMock.ensureDirSync.args.length).equals(1)
			o(fsExtraMock.ensureDirSync.args[0]).equals("/app/path/file/.config/tuta_integration")
			o(fsExtraMock.writtenFiles).deepEquals([
				{
					file: '/app/path/file/.config/tuta_integration/no_integration',
					content: '/appimage/path/file.appImage\n',
					opts: {encoding: 'utf-8', flag: 'a'}
				}
			])
			o(fsExtraMock.copiedFiles).deepEquals([])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})

	o("runIntegration with integration, outdated version", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {electronMock} = standardMocks()
		const fsExtraMock = n.mock("fs-extra", fsExtra).with({
			readFileSync: () => "X-Tutanota-Version=notAppVersion",
			access: () => Promise.resolve()
		}).set()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(electronMock.dialog.showMessageBox.callCount).equals(0)
			o(fsExtraMock.access.callCount).equals(2)
			o(fsExtraMock.writtenFiles).deepEquals([
				{
					file: '/app/path/file/.local/share/applications/appName.desktop',
					content: '[Desktop Entry]\nName=Tutanota Desktop\nComment=The desktop client for Tutanota, the secure e-mail service.\nExec="/appimage/path/file.appImage" %U\nTerminal=false\nType=Application\nIcon=appName.png\nStartupWMClass=de.tutao.appName\nMimeType=x-scheme-handler/mailto;\nCategories=Network;\nX-Tutanota-Version=appVersion\nTryExec=/appimage/path/file.appImage',
					opts: {encoding: 'utf-8'}
				}
			])
			o(fsExtraMock.copiedFiles).deepEquals([
				{
					from: '/opt/node-v10.11.0-linux-x64/bin/resources/icons/logo-solo-red-small.png',
					to: '/app/path/file/.local/share/icons/hicolor/64x64/apps/appName.png'
				},
				{
					from: '/opt/node-v10.11.0-linux-x64/bin/resources/icons/logo-solo-red.png',
					to: '/app/path/file/.local/share/icons/hicolor/512x512/apps/appName.png'
				}
			])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})

	o("runIntegration with integration, matching version", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {electronMock} = standardMocks()
		const fsExtraMock = n.mock("fs-extra", fsExtra).with({
			readFileSync: () => "X-Tutanota-Version=appVersion",
			access: () => Promise.resolve()
		}).set()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(electronMock.dialog.showMessageBox.callCount).equals(0)
			o(fsExtraMock.access.callCount).equals(2)
			o(fsExtraMock.writtenFiles).deepEquals([])
			o(fsExtraMock.copiedFiles).deepEquals([])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})

	o("runIntegration without integration, blacklisted", done => {
		n.setPlatform('linux')
		process.env.APPIMAGE = '/appimage/path/file.appImage'
		const {electronMock} = standardMocks()
		const fsExtraMock = n.mock("fs-extra", fsExtra).with({
			readFileSync: () => '/another/blacklisted/file.appImage\n/appimage/path/file.appImage',
			access: p => p === '/app/path/file/.config/tuta_integration/no_integration' ? Promise.resolve() : Promise.reject()
		}).set()
		const {runIntegration} = n.subject("../../src/desktop/integration/DesktopIntegrator.js")
		runIntegration()
		setTimeout(() => {
			o(electronMock.dialog.showMessageBox.callCount).equals(0)
			o(fsExtraMock.access.callCount).equals(3)
			o(fsExtraMock.writtenFiles).deepEquals([])
			o(fsExtraMock.copiedFiles).deepEquals([])
			delete process.env.APPIMAGE
			done()
		}, 10)
	})
})