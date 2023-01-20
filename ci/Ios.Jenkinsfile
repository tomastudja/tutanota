pipeline {
	environment {
		NODE_PATH = "/opt/node-v16.3.0-linux-x64/bin"
		NODE_MAC_PATH = "/usr/local/opt/node@16/bin/"
		VERSION = sh(returnStdout: true, script: "${NODE_PATH}/node -p -e \"require('./package.json').version\" | tr -d \"\n\"")
		RELEASE_NOTES_PATH = "app-ios/fastlane/metadata/default/release_notes.txt"
	}

	agent {
		label 'linux'
	}

	parameters {
		booleanParam(
			name: 'RELEASE',
			defaultValue: false,
			description: "Build testing and production version, and upload them to nexus/testflight/appstore. " +
				"The production version will need to be released manually from appstoreconnect.apple.com"
		)
		persistentText(
			name: "releaseNotes",
			defaultValue: "",
			description: "release notes for this build"
		 )
	}

	stages {
    	stage('Check Github') {
			steps {
				script {
					def util = load "ci/jenkins-lib/util.groovy"
					util.checkGithub()
				}
			}
    	}
		stage("Run tests") {
			agent {
				label 'mac'
			}
			environment {
				LC_ALL = "en_US.UTF-8"
				LANG = "en_US.UTF-8"
			}
			steps {
				script {
					dir('app-ios') {
						sh 'fastlane test'
					}
				}
			}
		}

		stage("Build and upload to Apple") {
			environment {
				PATH = "${env.NODE_MAC_PATH}:${env.PATH}"
				MATCH_GIT_URL = "git@gitlab:/tuta/apple-certificates.git"
				LC_ALL = "en_US.UTF-8"
				LANG = "en_US.UTF-8"
			}
			agent {
				label 'mac'
			}
			stages {
				stage('Testing') {
					steps {
						script {
							script {
								doBuild('test', 'adhoctest', false)
								stash includes: "app-ios/releases/tutanota-${VERSION}-test.ipa", name: 'ipa-testing'
							}
						}
					}
				}
				stage('Production') {
					steps {
						script {
							doBuild('prod', 'adhoc', params.RELEASE)
							stash includes: "app-ios/releases/tutanota-${VERSION}-adhoc.ipa", name: 'ipa-production'

						}
					}
				}
			}
		}

		stage('Upload to Nexus') {
			environment {
				PATH = "${env.NODE_PATH}:${env.PATH}"
			}
			when {
				expression { params.RELEASE }
			}
			agent {
				label 'linux'
			}
			steps {
				script {

					unstash 'ipa-testing'
					unstash 'ipa-production'

					script {
						catchError(stageResult: 'UNSTABLE', buildResult: 'SUCCESS', message: 'There was an error when uploading to Nexus') {
							publishToNexus("ios-test", "tutanota-${VERSION}-test.ipa")
							publishToNexus("ios", "tutanota-${VERSION}-adhoc.ipa")
						}
					}
				}
			}
		}

		stage('Tag and create github release page') {
			environment {
				PATH = "${env.NODE_PATH}:${env.PATH}"
			}
			when {
				expression { params.RELEASE }
			}
			agent {
				label 'linux'
			}
			steps {
				script {

					catchError(stageResult: 'UNSTABLE', buildResult: 'SUCCESS', message: 'Failed to create github release page for ios') {
						def tag = "tutanota-ios-release-${VERSION}"
						// need to run npm ci to install dependencies of releaseNotes.js
						sh "npm ci"

						writeFile file: "notes.txt", text: params.releaseNotes
						withCredentials([string(credentialsId: 'github-access-token', variable: 'GITHUB_TOKEN')]) {
							sh """node buildSrc/createReleaseDraft.js --name '${VERSION} (iOS)' \
																		   --tag 'tutanota-ios-release-${VERSION}' \
																		   --notes notes.txt"""
						} // withCredentials
						sh "rm notes.txt"
					} // catchError
				}
			}
		}
	}
}

void doBuild(String stage, String lane, boolean publishToAppStore) {

	// Prepare the fastlane Appfile which defines the required ids for the ios app build.
	script {
		def app_identifier = 'de.tutao.tutanota'
		def appfile = './app-ios/fastlane/Appfile'

		sh "echo \"app_identifier('${app_identifier}')\" > ${appfile}"

		withCredentials([string(credentialsId: 'apple-id', variable: 'apple_id')]) {
			sh "echo \"apple_id('${apple_id}')\" >> ${appfile}"
		}
		withCredentials([string(credentialsId: 'itc-team-id', variable: 'itc_team_id')]) {
			sh "echo \"itc_team_id('${itc_team_id}')\" >> ${appfile}"
		}
		withCredentials([string(credentialsId: 'team-id', variable: 'team_id')]) {
			sh "echo \"team_id('${team_id}')\" >> ${appfile}"
		}
	}

	script {
		catchError(stageResult: 'UNSTABLE', buildResult: 'SUCCESS', message: 'Failed to create github release notes for ios') {
			// need to run npm ci to install dependencies of releaseNotes.js
			sh "npm ci"
			writeFile file: "notes.txt", text: params.releaseNotes
			withCredentials([string(credentialsId: 'github-access-token', variable: 'GITHUB_TOKEN')]) {
				sh """node buildSrc/createReleaseDraft.js --name '${VERSION} (iOS)' \
																   --tag 'tutanota-ios-release-${VERSION}'\
																   --notes notes.txt \
																   --toFile ${RELEASE_NOTES_PATH}"""
			}
			sh "rm notes.txt"
		}
	}

	sh "echo Created release notes for fastlane ${RELEASE_NOTES_PATH}"
	sh "pwd"

	sh "echo $PATH"
	sh "npm ci"
	sh 'npm run build-packages'
	sh "node --max-old-space-size=8192 webapp ${stage}"
	sh "node buildSrc/prepareMobileBuild.js dist"

	withCredentials([
			file(credentialsId: 'appstore-api-key-json', variable: "API_KEY_JSON_FILE_PATH"),
			string(credentialsId: 'match-password', variable: 'MATCH_PASSWORD'),
			string(credentialsId: 'team-id', variable: 'FASTLANE_TEAM_ID'),
			sshUserPrivateKey(credentialsId: 'jenkins', keyFileVariable: 'MATCH_GIT_PRIVATE_KEY'),
			string(credentialsId: 'fastlane-keychain-password', variable: 'FASTLANE_KEYCHAIN_PASSWORD')
	]) {
		dir('app-ios') {
			sh "security unlock-keychain -p ${FASTLANE_KEYCHAIN_PASSWORD}"

			// Set git ssh command to avoid ssh prompting to confirm an unknown host
			// (since we don't have console access we can't confirm and it gets stuck)
			sh "GIT_SSH_COMMAND=\"ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no\" fastlane ${lane}"
			if (publishToAppStore) {
				sh "GIT_SSH_COMMAND=\"ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no\" fastlane release submit:true"
			}
		}
	}
}

void publishToNexus(String artifactId, String ipaFileName) {
	def util = load "ci/jenkins-lib/util.groovy"
	util.publishToNexus(groupId: "app",
			artifactId: "${artifactId}",
			version: "${VERSION}",
			assetFilePath: "${WORKSPACE}/app-ios/releases/${ipaFileName}",
			fileExtension: "ipa"
	)
}