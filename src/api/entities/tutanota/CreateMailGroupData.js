// @flow

import {create} from "../../common/utils/EntityUtils"
import {TypeRef} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes"

import type {InternalGroupData} from "./InternalGroupData"

export const CreateMailGroupDataTypeRef: TypeRef<CreateMailGroupData> = new TypeRef("tutanota", "CreateMailGroupData")
export const _TypeModel: TypeModel = {
	"name": "CreateMailGroupData",
	"since": 19,
	"type": "DATA_TRANSFER_TYPE",
	"id": 707,
	"rootId": "CHR1dGFub3RhAALD",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_format": {
			"id": 708,
			"type": "Number",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"encryptedName": {
			"id": 710,
			"type": "Bytes",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"mailAddress": {
			"id": 709,
			"type": "String",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		},
		"mailEncMailboxSessionKey": {
			"id": 711,
			"type": "Bytes",
			"cardinality": "One",
			"final": false,
			"encrypted": false
		}
	},
	"associations": {
		"groupData": {
			"id": 712,
			"type": "AGGREGATION",
			"cardinality": "One",
			"final": false,
			"refType": "InternalGroupData",
			"dependency": null
		}
	},
	"app": "tutanota",
	"version": "49"
}

export function createCreateMailGroupData(values?: $Shape<$Exact<CreateMailGroupData>>): CreateMailGroupData {
	return Object.assign(create(_TypeModel, CreateMailGroupDataTypeRef), values)
}

export type CreateMailGroupData = {
	_type: TypeRef<CreateMailGroupData>;

	_format: NumberString;
	encryptedName: Uint8Array;
	mailAddress: string;
	mailEncMailboxSessionKey: Uint8Array;

	groupData: InternalGroupData;
}