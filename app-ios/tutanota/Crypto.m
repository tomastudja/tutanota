//
//  Crypto.m
//  Tutanota plugin
//
//  Created by Tutao GmbH on 24.09.14.
//
//

#import <Foundation/Foundation.h>


#import "Crypto.h"
#import <openssl/ossl_typ.h>
#import <openssl/md5.h>
#import <openssl/rsa.h>
#import <openssl/err.h>
#import <openssl/evp.h>
#import "rsa_oaep_sha256.h"
#import <openssl/bn.h>
#import <openssl/rand.h>
#import "JFBCrypt.h"
#import <CommonCrypto/CommonDigest.h>
#include "TutaoAes128Facade.h"
#include "TutaoEncodingConverter.h"
#include "FileUtil.h"

static NSString * const CRYPTO_ERROR_DOMAIN = @"tutacrypto";
static NSInteger const RSA_KEY_LENGTH_IN_BITS = 2048;

@implementation Crypto

- (void)generateRsaKeyWithSeed:(NSString * _Nonnull)base64Seed completion:(void (^)(NSDictionary *keyPair, NSError *error))completion {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
		// seeds the PRNG (pseudorandom number generator)
		NSData * seed = [[NSData alloc] initWithBase64EncodedString:base64Seed options:0];
		RAND_seed([seed bytes], (int) [seed length]);
		
		
		RSA* rsaKey = RSA_new();
		NSString * publicExponent = @"65537";
		BIGNUM * e = BN_new();
		BN_dec2bn(&e, [publicExponent UTF8String]); // public exponent <- 65537
		
		// generate rsa key
		int status = RSA_generate_key_ex(rsaKey, RSA_KEY_LENGTH_IN_BITS, e, NULL);
		if (status > 0){
			NSMutableDictionary* keyPair = [Crypto createRSAKeyPair:rsaKey
			 keyLength:[NSNumber numberWithInteger: RSA_KEY_LENGTH_IN_BITS]
			 version:[NSNumber numberWithInt:0]];
			completion(keyPair, nil);
		} else {
			[Crypto logError:@"Error while generating rsa key"];
			completion(nil, [NSError errorWithDomain:CRYPTO_ERROR_DOMAIN code:status userInfo:nil]);
		}
		BN_free(e);
		RSA_free(rsaKey);
	});
}

- (void)rsaEncryptWithPublicKey:(NSObject * _Nonnull)publicKey base64Data:(NSString * _Nonnull)base64Data completeion:(void (^ _Nonnull)(NSString * _Nullable encryptedBase64, NSError * _Nullable error))completion {
	//convert json data to private key;
	RSA* publicRsaKey = [Crypto createPublicRSAKey:publicKey];

	// convert base64 data to bytes.
	NSData *decodedData = [[NSData alloc] initWithBase64EncodedString:base64Data options: 0];

	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
		int rsaSize = RSA_size(publicRsaKey); // should be 256 for a 2048 bit rsa key
		NSMutableData *paddingBuffer = [NSMutableData dataWithLength:rsaSize];
		int paddingLength = (int) [paddingBuffer length];

		// add padding
		int status = RSA_padding_add_PKCS1_OAEP_SHA256([paddingBuffer mutableBytes], paddingLength, [decodedData bytes], (int) [decodedData length], NULL, 0);

		NSMutableData *encryptedData = [NSMutableData dataWithLength:rsaSize];
		if (status >= 0){
			// encrypt
			status = RSA_public_encrypt(paddingLength, [paddingBuffer bytes], [encryptedData mutableBytes], publicRsaKey,  RSA_NO_PADDING);
		}
		if (status >= 0) {
			// Success
			NSString* encryptedBase64 = [encryptedData base64EncodedStringWithOptions:0];
			completion(encryptedBase64, nil);
		} else {
			// Error handling
			[Crypto logError:@"encryption failed"];
			NSError *error = [NSError errorWithDomain:CRYPTO_ERROR_DOMAIN code:status userInfo:nil];
			completion(nil, error);
		}
		RSA_free(publicRsaKey);
	});
}


- (void)rsaDecryptWithPrivateKey:(NSObject * _Nonnull)privateKey base64Data:(NSString * _Nonnull)base64Data completion:(void (^)(NSString * _Nullable decryptedBase64, NSError * _Nullable error))completion {

	//convert json data to private key;
	RSA* privateRsaKey = [Crypto createPrivateRSAKey:privateKey];

	int rsaCheckResult = RSA_check_key(privateRsaKey);
	if (rsaCheckResult != 1){
		[Crypto logError:@"Invald private key"];
	}

	// convert encrypted base64 data to bytes.
	NSData *decodedData =  [[NSData alloc] initWithBase64EncodedString:base64Data options: 0];

	int rsaSize = RSA_size(privateRsaKey); // should be 256 for a 2048 bit rsa key
	NSMutableData *decryptedBuffer = [NSMutableData dataWithLength:rsaSize];

	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
		// Decrypt
		int status = RSA_private_decrypt((int) [decodedData length], [decodedData bytes], [decryptedBuffer mutableBytes], privateRsaKey, RSA_NO_PADDING);

		NSMutableData *paddingBuffer =[NSMutableData dataWithLength:rsaSize];
		// decryption succesfull remove padding
		if ( status >= 0 ){
			// converstion to bn and back is necessary to prepare paremeter flen for RSA_padding_check. Passing 256 to flen does not work.
			// see: http://marc.info/?l=openssl-users&m=108573630510562&w=2
			BIGNUM *bn = BN_bin2bn([decryptedBuffer bytes], (int) [decryptedBuffer length], NULL);
			int flen = BN_bn2bin(bn, [decryptedBuffer mutableBytes]);
			status = RSA_padding_check_PKCS1_OAEP_SHA256([paddingBuffer mutableBytes], (int) [paddingBuffer length], [decryptedBuffer bytes], flen, rsaSize, NULL, 0);
		}

		if (status > 0) {
			// Success
			NSData* decryptedData = [NSData dataWithBytes:[paddingBuffer bytes] length:status];
			NSString* decryptedBase64 = [decryptedData base64EncodedStringWithOptions:0];
			completion(decryptedBase64, nil);
		} else {
			// Error handling
			[Crypto logError:@"decryption failed"];
			NSError *error = [NSError errorWithDomain:CRYPTO_ERROR_DOMAIN code:status userInfo:nil];
			completion(nil, error);
		}
		RSA_free(privateRsaKey);
	});
}



+ (RSA *)createPrivateRSAKey:(NSObject*)key {
 	NSString* modulus = [key valueForKey:@"modulus"];
	NSString* privateExponent = [key valueForKey:@"privateExponent"];
	NSString* primeP = [key valueForKey:@"primeP"];
	NSString* primeQ = [key valueForKey:@"primeQ"];
	NSString* primeExponentP = [key valueForKey:@"primeExponentP"];
 	NSString* primeExponentQ = [key valueForKey:@"primeExponentQ"];
 	NSString* crtCoefficient = [key valueForKey:@"crtCoefficient"];

	RSA* rsaKey = RSA_new();
	rsaKey->e = BN_new();
	rsaKey->n= BN_new();
	rsaKey->d= BN_new();
	rsaKey->p = BN_new();
	rsaKey->q = BN_new();
	rsaKey->dmp1 = BN_new();
	rsaKey->dmq1 = BN_new();
	rsaKey->iqmp = BN_new();

	const char * publicExponent = "65537";
	BN_dec2bn(&rsaKey->e, publicExponent ); // public exponent <- 65537
	[Crypto toBIGNUM:rsaKey->n fromB64:modulus]; // public modulus <- modulus
	[Crypto toBIGNUM:rsaKey->d fromB64:privateExponent]; // private exponent <- privateExponent
	[Crypto toBIGNUM:rsaKey->p fromB64:primeP]; // secret prime factor <- primeP
	[Crypto toBIGNUM:rsaKey->q fromB64:primeQ ]; // secret prime factor <- primeQ
	[Crypto toBIGNUM:rsaKey->dmp1 fromB64:primeExponentP]; // d mod (p-1) <- primeExponentP
	[Crypto toBIGNUM:rsaKey->dmq1 fromB64:primeExponentQ]; // d mod (q-1) <- primeExponentQ
	[Crypto toBIGNUM:rsaKey->iqmp fromB64:crtCoefficient]; // q^-1 mod p <- crtCoefficient
    return rsaKey;
}


+ (RSA *)createPublicRSAKey:(NSObject*)key {
 	NSString* modulus = [key valueForKey:@"modulus"];

	RSA* rsaKey = RSA_new();
	rsaKey->e = BN_new();
	rsaKey->n= BN_new();

	const char * publicExponent = "65537";
	BN_dec2bn(&rsaKey->e, publicExponent ); // public exponent <- 65537
	[Crypto toBIGNUM:rsaKey->n fromB64:modulus]; // public modulus <- modulus
    return rsaKey;
}



+ (BIGNUM *)toBIGNUM:(BIGNUM*)number fromB64:(NSString*)value{
	NSData *valueData =  [[NSData alloc] initWithBase64EncodedString:value options: 0];
    return BN_bin2bn((unsigned char *) [valueData bytes], (int) [valueData length], number);
}

+ (NSString *)toB64:(BIGNUM*)number{
	int numBytes = BN_num_bytes(number);
	NSMutableData* nsData = [NSMutableData dataWithLength:numBytes];
	BN_bn2bin(number, [nsData mutableBytes]);
	return [nsData base64EncodedStringWithOptions:0];
}


+ (void) logError:(NSString *)msg {
	ERR_load_crypto_strings();
	int errorCode = (int) ERR_get_error();
	size_t messageBufferSize = 256;
	char* messageBuffer = (char *)calloc(messageBufferSize, sizeof(char));
	while (errorCode != 0){
		ERR_error_string( errorCode, messageBuffer);
		NSLog(@"Error: %@ <%i|%s>", msg, errorCode, messageBuffer);
	}
	ERR_free_strings();
}


+ (NSMutableDictionary *)createRSAKeyPair:(RSA*)key keyLength:(NSNumber*)keyLength version:(NSNumber*)version {
	NSMutableDictionary* publicKey= [NSMutableDictionary new];
	[publicKey setObject: version forKey: @"version"];
	[publicKey setObject: keyLength forKey: @"keyLength"];
	[publicKey setObject: [Crypto toB64:key->n] forKey: @"modulus"];

	NSMutableDictionary* privateKey= [NSMutableDictionary new];
	[privateKey setObject: version forKey: @"version"];
	[privateKey setObject: keyLength forKey: @"keyLength"];
	[privateKey setObject: [Crypto toB64:key->n]  forKey: @"modulus"];

	[privateKey setObject: [Crypto toB64:key->d] forKey: @"privateExponent"];
	[privateKey setObject: [Crypto toB64:key->p] forKey: @"primeP"];
	[privateKey setObject: [Crypto toB64:key->q] forKey: @"primeQ"];
	[privateKey setObject: [Crypto toB64:key->dmp1] forKey: @"primeExponentP"];
	[privateKey setObject: [Crypto toB64:key->dmq1] forKey: @"primeExponentQ"];
	[privateKey setObject: [Crypto toB64:key->iqmp] forKey: @"crtCoefficient"];

	NSMutableDictionary* keyPair= [NSMutableDictionary new];
	[keyPair setObject: publicKey forKey: @"publicKey"];
	[keyPair setObject: privateKey forKey: @"privateKey"];
    return keyPair;
}

//- (void)aesEncrypt:(CDVInvokedUrlCommand*)command{
//     [self.commandDelegate runInBackground:^{
//		CDVPluginResult* pluginResult = nil;
//		NSString *keyBase64 = [command.arguments objectAtIndex:0];
//		NSString *plainTextBase64 = [command.arguments objectAtIndex:1];
//		NSData *key = [TutaoEncodingConverter base64ToBytes:keyBase64];
//		NSData *plainTextData = [TutaoEncodingConverter base64ToBytes:plainTextBase64];
//		NSError *error=nil;
//
//		TutaoAes128Facade *aesFacade = [[TutaoAes128Facade alloc]init];
//		NSData *iv = [self generateIv];
//		if(!iv){
//			pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"failed to create iv"];
//			[self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
//			return;
//		}
//		NSData* encryptedData = [aesFacade encrypt:plainTextData withKey:key withIv:iv error:&error];
//		if (error){
//			[TutaoUtils sendErrorResult:error invokedCommand:command delegate:self.commandDelegate];
//		} else {
//			NSString *encryptedDataBase64 = [TutaoEncodingConverter bytesToBase64:encryptedData];
//			pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsString:encryptedDataBase64];
//		}
//     }];
//};
//
//
//- (void)aesEncryptFile:(CDVInvokedUrlCommand*)command{
//     [self.commandDelegate runInBackground:^{
//		NSError *error;
//
//		NSData *key =[TutaoEncodingConverter base64ToBytes:[command.arguments objectAtIndex:0]];
//		NSString *filePath = [command.arguments objectAtIndex:1];
//
//		if (![FileUtil fileExistsAtPath:filePath]){
//			[TutaoUtils sendErrorMessage:[NSString stringWithFormat:@"file to encrypt does not exists:%@", filePath] invokedCommand:command delegate:self.commandDelegate];
//			return;
//		};
//
//		NSString *encryptedFolder = [FileUtil getEncryptedFolder:&error];
//		if(error){
//			[TutaoUtils sendErrorResult:error invokedCommand:command delegate:self.commandDelegate];
//			return;
//		}
//
//		NSInputStream *plainTextFileStream = [[NSInputStream alloc] initWithFileAtPath:filePath];
//
//		NSString *encryptedFilePath = [encryptedFolder stringByAppendingPathComponent:[filePath lastPathComponent]];
//		NSOutputStream *encryptedFileStream = [[NSOutputStream alloc] initToFileAtPath:encryptedFilePath append:NO];
//
//		[plainTextFileStream open];
//		[encryptedFileStream open];
//
//
//		NSData *iv = [self generateIv];
//		TutaoAes128Facade *aesFacade = [[TutaoAes128Facade alloc]init];
//
//		[aesFacade encryptStream:plainTextFileStream result:encryptedFileStream withKey:key withIv:iv error:&error];
//
//		[plainTextFileStream close];
//		[encryptedFileStream close];
//
//		if (error){
//			[TutaoUtils sendErrorResult:error invokedCommand:command delegate:self.commandDelegate];
//		} else {
//			CDVPluginResult* pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsString:encryptedFilePath];
//			[self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
//		}
//     }];
//};
//
//
//- (void)aesDecrypt:(CDVInvokedUrlCommand*)command{
//     [self.commandDelegate runInBackground:^{
//		CDVPluginResult* pluginResult = nil;
//		NSData *key = [TutaoEncodingConverter base64ToBytes:[command.arguments objectAtIndex:0]];
//		NSData *encryptedData = [TutaoEncodingConverter base64ToBytes:[command.arguments objectAtIndex:1]];
//		NSError *error=nil;
//
//		TutaoAes128Facade *aesFacade = [[TutaoAes128Facade alloc]init];
//
//		NSData* plainTextData = [aesFacade decrypt:encryptedData withKey:key error:&error];
//		if (error){
//			[TutaoUtils sendErrorResult:error invokedCommand:command delegate:self.commandDelegate];
//		} else {
//			NSString *plainTextBase64 = [TutaoEncodingConverter bytesToBase64:plainTextData];
//			pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsString:plainTextBase64];
//			[self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
//		}
//     }];
//};
//
//
//- (void)aesDecryptFile:(CDVInvokedUrlCommand*)command{
//     [self.commandDelegate runInBackground:^{
//		NSError *error;
//		NSData *key =[TutaoEncodingConverter base64ToBytes:[command.arguments objectAtIndex:0]];
//		NSString *filePath = [command.arguments objectAtIndex:1];
//
//		if (![FileUtil fileExistsAtPath:filePath]){
//			[TutaoUtils sendErrorMessage:[NSString stringWithFormat:@"file to decrypt does not exists:%@", filePath] invokedCommand:command delegate:self.commandDelegate];
//			return;
//		};
//
//		NSString *decryptedFolder = [FileUtil getDecryptedFolder:&error];
//		if(error){
//			[TutaoUtils sendErrorResult:error invokedCommand:command delegate:self.commandDelegate];
//			return;
//		}
//
//		NSData *fileData = [[NSFileManager defaultManager] contentsAtPath:filePath];
//		BOOL useMac = [fileData length]  % 2 == 1;
//
//		if(useMac){
//			NSData *hash  = [Crypto sha256:key];
//			key = [hash subdataWithRange:NSMakeRange(0, 16)];
//			fileData = [NSData dataWithBytesNoCopy:(void * _Nonnull)(fileData.bytes + 1) length:fileData.length - 33 freeWhenDone:NO];
//		}
//
//		NSInputStream *encryptedFileStream = [[NSInputStream alloc] initWithData:fileData];
//
//		NSString *plainTextFilePath = [decryptedFolder stringByAppendingPathComponent:[filePath lastPathComponent]];
//		NSOutputStream *plainTextFileStream = [[NSOutputStream alloc] initToFileAtPath:plainTextFilePath append:NO];
//
//		[plainTextFileStream open];
//		[encryptedFileStream open];
//
//		TutaoAes128Facade *aesFacade = [[TutaoAes128Facade alloc]init];
//
//		[aesFacade decryptStream:encryptedFileStream result:plainTextFileStream withKey:key error:&error];
//
//		[plainTextFileStream close];
//		[encryptedFileStream close];
//
//		if (error){
//			[TutaoUtils sendErrorResult:error invokedCommand:command delegate:self.commandDelegate];
//		} else {
//			CDVPluginResult* pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsString:plainTextFilePath];
//			[self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
//		}
//     }];
//};

- (NSData*) generateIv {
	unsigned char buffer[TUTAO_IV_BYTE_SIZE];
	int rc = RAND_bytes(buffer, (int) TUTAO_IV_BYTE_SIZE);
	if (rc!=1){
		return nil;
	}
	return [[NSData alloc]initWithBytes:buffer length:TUTAO_IV_BYTE_SIZE];
}


+ (NSData *)sha256:(NSData *)data {
    unsigned char hash[CC_SHA256_DIGEST_LENGTH];
    if (CC_SHA256([data bytes], (int) [data length], hash) ) {
        return [NSData dataWithBytes:hash length:CC_SHA256_DIGEST_LENGTH];
    }
	return nil;
}
@end



