//@flow
import {TutanotaError} from "./TutanotaError"
import type {TranslationKeyType} from "../../../misc/TranslationKey"
import {assertMainOrNode} from "../../Env"
import {lang} from "../../../misc/LanguageViewModel"

assertMainOrNode()

/**
 * Thrown when the business feature is not booked for a customer but required to execute a certain function.
 */
export class BusinessFeatureRequiredError extends TutanotaError {
	constructor(message: TranslationKeyType | lazy<string>) {
		super("BusinessFeatureRequiredError", lang.getMaybeLazy(message))
	}
}