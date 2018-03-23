// @flow
import o from "ospec/ospec.js"
import {createContact} from "../../../src/api/entities/tutanota/Contact"
import {
	compareMailAddresses,
	compareFullname,
	comparePhoneNumbers,
	compareResidualContactFields,
	compareContactsForMerge
} from "../../../src/contacts/ContactMergeView"
import {createContactMailAddress} from "../../../src/api/entities/tutanota/ContactMailAddress"
import {createContactPhoneNumber} from "../../../src/api/entities/tutanota/ContactPhoneNumber"

o.spec("GetMergableContactsTest", function () {
// tests are made for the validation of the comparison functions to finde mergable contacts

	let allContacts = []
	allContacts[0] = createContact()
	allContacts[1] = createContact()
	o("testCompareMailaddresses", function () {
		allContacts[0].mailAddresses[0] = createContactMailAddress()
		allContacts[1].mailAddresses[0] = createContactMailAddress()
		allContacts[0].phoneNumbers[0] = createContactPhoneNumber()
		allContacts[1].phoneNumbers[0] = createContactPhoneNumber()
		o(compareMailAddresses(allContacts[0], allContacts[1])).equals("unique")
		allContacts[0].firstName = "anton"
		allContacts[0].lastName = "stein"
		allContacts[0].mailAddresses[0].address = "anton@mail.de"


		allContacts[1].firstName = "anton"
		allContacts[1].lastName = "stein"
		allContacts[1].mailAddresses[0].address = "anton@mail.de"


		o(compareMailAddresses(allContacts[0], allContacts[1])).equals("equal")
		allContacts[1].mailAddresses[0].address = "TOM@mail.de"
		o(compareMailAddresses(allContacts[0], allContacts[1])).equals("unique")
		allContacts[1].mailAddresses[1] = createContactMailAddress()
		allContacts[1].mailAddresses[1].address = "anton@mail.de"
		o(compareMailAddresses(allContacts[0], allContacts[1])).equals("similar")
		allContacts[0].mailAddresses[1] = createContactMailAddress()
		allContacts[0].mailAddresses[1].address = "tom@mail.de"
		o(compareMailAddresses(allContacts[0], allContacts[1])).equals("similar")

	})
	o("testCompareFullNames", function () {
		allContacts[0].firstName = "anton"
		allContacts[0].lastName = "stein"
		allContacts[1].firstName = "bob"
		allContacts[1].lastName = "stein"
		o(compareFullname(allContacts[0], allContacts[1])).equals("unique")
		allContacts[1].firstName = ""
		o(compareFullname(allContacts[0], allContacts[1])).equals("similar")
		allContacts[0].firstName = ""
		o(compareFullname(allContacts[0], allContacts[1])).equals("equal")
		allContacts[0].lastName = ""
		allContacts[1].lastName = ""
		o(compareFullname(allContacts[0], allContacts[1])).equals(null)
		allContacts[0].firstName = "anton"
		allContacts[0].lastName = "stein"
		allContacts[1].firstName = "anton"
		allContacts[1].lastName = "stein"
		o(compareFullname(allContacts[0], allContacts[1])).equals("equal")
	})
	o("testComparePhonenumbers", function () {
		o(comparePhoneNumbers(allContacts[0], allContacts[1])).equals("equal")
		allContacts[0].phoneNumbers[0].number = "017695886177"
		allContacts[1].phoneNumbers[0].number = "017695886177"
		o(comparePhoneNumbers(allContacts[0], allContacts[1])).equals("equal")
		allContacts[1].phoneNumbers[0].number = "099999999999"
		o(comparePhoneNumbers(allContacts[0], allContacts[1])).equals("unique")
		allContacts[1].phoneNumbers[1] = createContactPhoneNumber()
		allContacts[1].phoneNumbers[1].number = "017695886177"
		o(comparePhoneNumbers(allContacts[0], allContacts[1])).equals("similar")
		allContacts[0].phoneNumbers[1] = createContactPhoneNumber()
		allContacts[0].phoneNumbers[1].number = "017695886177"
		allContacts[0].phoneNumbers[0].number = "‪+49 163 7917345‬"
		allContacts[1].phoneNumbers[0].number = "+49 163 7917345‬"
		allContacts[0].phoneNumbers[0].number = allContacts[0].phoneNumbers[0].number.replace(/[\u200A-\u202F]/g, "")
		allContacts[1].phoneNumbers[0].number = allContacts[1].phoneNumbers[0].number.replace(/[\u200A-\u202F]/g, "")

		o(comparePhoneNumbers(allContacts[0], allContacts[1])).equals("equal")
	})

	o("testCompareResidualContact", function () {
		allContacts[0].company = "Tutao GmbH"
		allContacts[1].company = "Tutao GmbH"
		//o(compareResidualContactFields(allContacts[0], allContacts[1])).equals("equal")
		allContacts[0].comment = "Tutao GmbH"
		allContacts[1].comment = "Hallo"
		o(compareResidualContactFields(allContacts[0], allContacts[1])).equals("unique")
		//todo bdayFormat testen


	})

	o("testCompareContactsForMerg", function () {
		allContacts[0] = createContact()
		allContacts[1] = createContact()
		allContacts[0].mailAddresses[0] = createContactMailAddress()
		allContacts[1].mailAddresses[0] = createContactMailAddress()
		allContacts[0].phoneNumbers[0] = createContactPhoneNumber()
		allContacts[1].phoneNumbers[0] = createContactPhoneNumber()
		allContacts[0].phoneNumbers[0].number = "123456"
		allContacts[1].phoneNumbers[0].number = "123456"

		allContacts[0].firstName = "anton"
		allContacts[0].lastName = "stein"
		allContacts[0].mailAddresses[0].address = "anton@mail.de"


		allContacts[1].firstName = "anton"
		allContacts[1].lastName = "stein"
		allContacts[1].mailAddresses[0].address = "anton@mail.de"

		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("equal")
		allContacts[0].mailAddresses[1] = createContactMailAddress()
		allContacts[0].mailAddresses[1].address = "tuta@io.de"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[1].mailAddresses[1] = createContactMailAddress()
		allContacts[1].mailAddresses[1].address = "TUTA@io.de"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[1].firstName = ""
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[1].firstName = "Bob"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[1].lastName = "BOB"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[0].firstName = "anton"
		allContacts[0].lastName = "stein"
		allContacts[0].mailAddresses[0].address = "anton@mail.de"
		allContacts[0].mailAddresses[1].address = "tuta@io.de"
		allContacts[0].phoneNumbers[0].number = "123456"
		allContacts[1].firstName = "anton"
		allContacts[1].lastName = "stein"
		allContacts[1].mailAddresses[0].address = "B@mail.de"
		allContacts[1].mailAddresses[1].address = "A@io.de"
		allContacts[1].phoneNumbers[0].number = "123456"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[1].phoneNumbers[0].number = "1234567890"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[0].firstName = "BoB"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("unique")
		allContacts[0].firstName = "bob"
		allContacts[0].lastName = "Stein"
		allContacts[0].mailAddresses[0] = createContactMailAddress()
		allContacts[0].mailAddresses[1] = createContactMailAddress()
		allContacts[0].phoneNumbers[0].number = "123456"
		allContacts[1].firstName = "anton"
		allContacts[1].lastName = "stein"
		allContacts[1].mailAddresses[0] = createContactMailAddress()
		allContacts[1].mailAddresses[1] = createContactMailAddress()
		allContacts[1].phoneNumbers[0].number = "12345678890"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("unique")


	})
	o("testCompareContactsWithPresharedPasswordForMerg", function () {
		allContacts[0] = createContact()
		allContacts[1] = createContact()
		allContacts[0].mailAddresses[0] = createContactMailAddress()
		allContacts[1].mailAddresses[0] = createContactMailAddress()
		allContacts[0].phoneNumbers[0] = createContactPhoneNumber()
		allContacts[1].phoneNumbers[0] = createContactPhoneNumber()
		allContacts[0].phoneNumbers[0].number = "017695886177"
		allContacts[1].phoneNumbers[0].number = "017695886177"
		allContacts[0].mailAddresses[0].address = "anton@mail.de"
		allContacts[1].mailAddresses[0].address = "anton@mail.de"

		allContacts[0].comment = "A"
		allContacts[1].comment = "A"

		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("equal")

		allContacts[0].firstName = "anton"
		allContacts[0].lastName = "stein"
		allContacts[1].firstName = "anton"
		allContacts[1].lastName = "stein"
		allContacts[1].presharedPassword = "B"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[0].presharedPassword = "A"
		allContacts[1].presharedPassword = null
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("similar")
		allContacts[1].presharedPassword = "B"
		o(compareContactsForMerge(allContacts[0], allContacts[1])).equals("unique")

	})

})