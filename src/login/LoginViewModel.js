//@flow
import {
	AccessBlockedError,
	AccessDeactivatedError,
	AccessExpiredError,
	BadRequestError,
	NotAuthenticatedError,
	TooManyRequestsError
} from "../api/common/error/RestError"
import {assertMainOrNode} from "../api/common/Env"
import type {TranslationKey} from "../misc/LanguageViewModel"
import {SecondFactorHandler} from "../misc/SecondFactorHandler"
import {CancelledError} from "../api/common/error/CancelledError"
import {getLoginErrorMessage} from "../misc/LoginUtils"
import type {LoginController} from "../api/main/LoginController"
import {SessionType} from "../api/main/LoginController"
import stream from "mithril/stream/stream.js"
import {ProgrammingError} from "../api/common/error/ProgrammingError"
import type {EncryptedCredentials} from "../misc/credentials/CredentialsProvider"
import {CredentialsProvider} from "../misc/credentials/CredentialsProvider"

assertMainOrNode()

export const DisplayMode = Object.freeze({
	Credentials: "credentials",
	Form: "form",
	DeleteCredentials: "deleteCredentials",
})
export type DisplayModeEnum = $Values<typeof DisplayMode>

export const LoginState = Object.freeze({
	LogginIn: "LogginIn",
	UnknownError: "UnknownError",
	InvalidCredentials: "InvalidCredentials",
	AccessExpired: "AccessExpired",
	NotAuthenticated: "NotAuthenticated",
	LoggedIn: "LoggedIn",
})

export type LoginStateEnum = $Values<typeof LoginState>

export interface ILoginViewModel {
	+state: LoginStateEnum;
	+displayMode: DisplayModeEnum;
	+mailAddress: Stream<string>;
	+password: Stream<string>;
	+helpText: TranslationKey;
	+savePassword: Stream<boolean>;

	/**
	 * Checks whether the viewmodel is in a state where it can attempt to login. This depends on the current displayMode as well as
	 * what data (email, password, userId, ...) has been set.
	 */
	canLogin(): boolean;

	/**
	 * Will tell the viewmodel to use a certain userId. If there are any stored credentials for that user-id on the device, it will
	 * load those, set them as potential credentials for login and switch to DisplayMode.Credentials. This is useful in order to prepare
	 * the viewmodel for an automatic login without user interaction.
	 * @param userId
	 */
	useUserId(userId: string): Promise<void>;

	/**
	 * Instructs the viewmodel to use the credentials passed for the next login attempt. Changes displayMode to DisplayMode.Credentials.
	 * @param credentials
	 */
	useCredentials(credentials: EncryptedCredentials): Promise<void>;

	/**
	 * Returns all credentials stored on the device.
	 */
	getSavedCredentials(): $ReadOnlyArray<EncryptedCredentials>;

	/**
	 * Attempts to log in. How the login will be performed (using stored credentials/using email and password) depends on the current
	 * DisplayMode.
	 */
	login(): Promise<void>;

	/**
	 * Deletes stored credentials from the device.
	 * @param credentials
	 */
	deleteCredentials(credentials: EncryptedCredentials): Promise<void>;

	/**
	 * Changes the display mode to DisplayMode.Form.
	 */
	showLoginForm(): void;

	/**
	 * Changes the display mode to DisplayMode.Credentials.
	 */
	showCredentials(): void;

	/**
	 * Toggles between DisplayMode.Credentials and DisplayMode.DeleteCredentials.
	 */
	switchDeleteState(): void
}

export class LoginViewModel implements ILoginViewModel {
	+_loginController: LoginController
	+_credentialsProvider: CredentialsProvider
	+_secondFactorHandler: SecondFactorHandler
	+mailAddress: Stream<string>;
	+password: Stream<string>;
	displayMode: DisplayModeEnum
	state: LoginStateEnum
	helpText: TranslationKey
	+savePassword: Stream<boolean>;
	_savedInternalCredentials: Array<EncryptedCredentials>
	_autoLoginCredentials: ?Credentials

	constructor(loginController: LoginController, credentialsProvider: CredentialsProvider, secondFactorHandler: SecondFactorHandler) {
		this._loginController = loginController
		this._credentialsProvider = credentialsProvider
		this._secondFactorHandler = secondFactorHandler
		this.state = LoginState.NotAuthenticated
		this.displayMode = DisplayMode.Form
		this.helpText = "emptyString_msg"
		this.mailAddress = stream("")
		this.password = stream("")
		this._autoLoginCredentials = null
		this.savePassword = stream(false)
		this._savedInternalCredentials = []
	}

	async init(): Promise<void> {
		await this._updateCachedCredentials()
	}

	async useUserId(userId: string): Promise<void> {
		this._autoLoginCredentials = await this._credentialsProvider.getCredentialsByUserId(userId)
		if (this._autoLoginCredentials) {
			this.displayMode = DisplayMode.Credentials
		} else {
			this.displayMode = DisplayMode.Form
		}
	}

	canLogin(): boolean {
		if (this.displayMode === DisplayMode.Credentials) {
			return this._autoLoginCredentials != null
				|| this._savedInternalCredentials.length === 1
		} else if (this.displayMode === DisplayMode.Form) {
			return Boolean(this.mailAddress() && this.password())
		} else {
			return false
		}
	}

	async useCredentials(encryptedCredentials: EncryptedCredentials): Promise<void> {
		const credentials = await this._credentialsProvider.getCredentialsByUserId(encryptedCredentials.userId)
		if (credentials) {
			this._autoLoginCredentials = credentials
			this.displayMode = DisplayMode.Credentials
		}
	}

	async login() {
		if (this.state === LoginState.LogginIn) return
		this.state = LoginState.LogginIn
		if (this.displayMode === DisplayMode.Credentials || this.displayMode === DisplayMode.DeleteCredentials) {
			await this._autologin()
		} else if (this.displayMode === DisplayMode.Form) {
			await this._formLogin()
		} else {
			throw new ProgrammingError(`Cannot login with current display mode: ${this.displayMode}`)
		}
	}

	async deleteCredentials(encryptedCredentials: EncryptedCredentials): Promise<void> {
		const credentials = await this._credentialsProvider.getCredentialsByUserId(encryptedCredentials.userId)
		if (credentials) {
			await this._loginController.deleteOldSession(credentials)
			await this._credentialsProvider.deleteByUserId(credentials.userId)
			await this._updateCachedCredentials()
		}
	}

	getSavedCredentials(): $ReadOnlyArray<EncryptedCredentials> {
		return this._savedInternalCredentials
	}

	switchDeleteState() {
		if (this.displayMode === DisplayMode.DeleteCredentials) {
			this.displayMode = DisplayMode.Credentials
		} else if (this.displayMode === DisplayMode.Credentials) {
			this.displayMode = DisplayMode.DeleteCredentials
		} else {
			throw new ProgrammingError("invalid state")
		}
	}

	showLoginForm() {
		this.displayMode = DisplayMode.Form
	}

	showCredentials() {
		this.displayMode = DisplayMode.Credentials
	}

	async _updateCachedCredentials() {
		this._savedInternalCredentials = await this._credentialsProvider.getAllInternalEncryptedCredentials()
		if (this._savedInternalCredentials.length > 0) {
			this.displayMode = DisplayMode.Credentials
		} else {
			this.displayMode = DisplayMode.Form
		}
	}

	async _autologin(): Promise<void> {
		try {
			if (!this._autoLoginCredentials) {
				const allCredentials = await this._credentialsProvider.getAllInternalEncryptedCredentials()
				const firstEncryptedCredentials = allCredentials[0]
				if (firstEncryptedCredentials) {
					this._autoLoginCredentials = await this._credentialsProvider.getCredentialsByUserId(firstEncryptedCredentials.userId)
				}
			}
			if (this._autoLoginCredentials) {
				await this._loginController.resumeSession(this._autoLoginCredentials)
				await this._onLogin()
			}
		} catch (e) {
			await this._onLoginFailed(e)
		}

		if (this.state === LoginState.AccessExpired || this.state === LoginState.InvalidCredentials) {
			this.displayMode = DisplayMode.Form
			this.mailAddress(this._autoLoginCredentials?.login ?? "")
		}
	}

	async _formLogin(): Promise<void> {
		const mailAddress = this.mailAddress()
		const password = this.password()
		const savePassword = this.savePassword()

		if (mailAddress === "" || password === "") {
			this.helpText = 'loginFailed_msg'
			return
		}
		this.helpText = 'login_msg'
		this.state = LoginState.LogginIn
		try {

			const newCredentials = await this._loginController.createSession(mailAddress, password, savePassword, SessionType.Login)
			await this._onLogin()

			// There are situations when we have stored credentials with the same mail address as we are trying to use now but this
			// stored session belongs to another user. This can happen e.g. when email address alias is moved to another user.
			const storedCredentialsToDelete = this._savedInternalCredentials
			                                      .filter(c => c.login === mailAddress || c.userId === newCredentials.userId)
			for (const credentialToDelete of storedCredentialsToDelete) {
				const credentials = await this._credentialsProvider.getCredentialsByUserId(credentialToDelete.userId)
				if (credentials) {
					await this._loginController.deleteOldSession(credentials)
					await this._credentialsProvider.deleteByUserId(credentials.userId)
				}
			}
			
			if (savePassword) {
				await this._credentialsProvider.store(newCredentials)
			}

		} catch (e) {
			await this._onLoginFailed(e)
		} finally {
			await this._secondFactorHandler.closeWaitingForSecondFactorDialog()
		}
	}

	async _onLogin(): Promise<void> {
		this.helpText = "emptyString_msg"
		this.state = LoginState.LoggedIn
	}

	async _onLoginFailed(error: Error): Promise<void> {
		this.helpText = getLoginErrorMessage(error, false)
		if (error instanceof BadRequestError || error instanceof NotAuthenticatedError) {
			this.state = LoginState.InvalidCredentials
		} else if (error instanceof AccessExpiredError) {
			this.state = LoginState.AccessExpired
		} else {
			this.state = LoginState.UnknownError
		}
		if (error instanceof BadRequestError
			|| error instanceof NotAuthenticatedError
			|| error instanceof AccessExpiredError
			|| error instanceof AccessBlockedError
			|| error instanceof AccessDeactivatedError
			|| error instanceof TooManyRequestsError
			|| error instanceof CancelledError) {
		} else {
			throw error
		}
	}
}
