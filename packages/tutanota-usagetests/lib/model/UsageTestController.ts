import {ObsoleteUsageTest, UsageTest} from "./UsageTest.js"
import {PingAdapter} from "../storage/PingAdapter.js"

export class UsageTestController {
	private readonly tests: Map<string, UsageTest> = new Map<string, UsageTest>()
	_pingAdapter?: PingAdapter
	private readonly obsoleteUsageTest: ObsoleteUsageTest

	constructor() {
		this.obsoleteUsageTest = new ObsoleteUsageTest("obsolete", "obsolete", 0)
	}

	set pingAdapter(pingAdapter: PingAdapter) {
		this._pingAdapter = pingAdapter

		for (let test of this.tests.values()) {
			test.pingAdapter = pingAdapter
		}
	}

	addTest(test: UsageTest) {
		test.pingAdapter = this._pingAdapter
		this.tests.set(test.testId, test)
	}

	addTests(tests: UsageTest[]) {
		for (let test of tests) {
			this.addTest(test)
		}
	}

	/**
	 * Searches a test first by its ID and then, if no match is found, by its name.
	 * If no test matches by name either, then we assume that the test is finished and the server no longer sends assignments for it.
	 * In that case, we want to render the no-participation variant, so a sham test instance needs to be returned.
	 *
	 * @param testIdOrName The test's ID or its name
	 */
	getTest(testIdOrName: string): UsageTest {
		let result = this.tests.get(testIdOrName)

		if (!!result) {
			return result
		}

		for (let test of this.tests.values()) {
			if (test.testName === testIdOrName) {
				return test
			}
		}

		return this.obsoleteUsageTest
	}
}