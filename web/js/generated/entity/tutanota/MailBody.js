"use strict";

tutao.provide('tutao.entity.tutanota.MailBody');

/**
 * @constructor
 * @param {Object=} data The json data to store in this entity.
 */
tutao.entity.tutanota.MailBody = function(data) {
  if (data) {
    this.updateData(data);
  } else {
    this.__area = null;
    this.__format = "0";
    this.__id = null;
    this.__owner = null;
    this.__ownerEncSessionKey = null;
    this.__ownerGroup = null;
    this.__permissions = null;
    this._text = null;
    this._text_ = null;
  }
  this._entityHelper = new tutao.entity.EntityHelper(this);
  this.prototype = tutao.entity.tutanota.MailBody.prototype;
};

/**
 * Updates the data of this entity.
 * @param {Object=} data The json data to store in this entity.
 */
tutao.entity.tutanota.MailBody.prototype.updateData = function(data) {
  this.__area = data._area;
  this.__format = data._format;
  this.__id = data._id;
  this.__owner = data._owner;
  this.__ownerEncSessionKey = data._ownerEncSessionKey;
  this.__ownerGroup = data._ownerGroup;
  this.__permissions = data._permissions;
  this._text = data.text;
  this._text_ = null;
};

/**
 * The version of the model this type belongs to.
 * @const
 */
tutao.entity.tutanota.MailBody.MODEL_VERSION = '17';

/**
 * The url path to the resource.
 * @const
 */
tutao.entity.tutanota.MailBody.PATH = '/rest/tutanota/mailbody';

/**
 * The id of the root instance reference.
 * @const
 */
tutao.entity.tutanota.MailBody.ROOT_INSTANCE_ID = 'CHR1dGFub3RhACQ';

/**
 * The generated id type flag.
 * @const
 */
tutao.entity.tutanota.MailBody.GENERATED_ID = true;

/**
 * The encrypted flag.
 * @const
 */
tutao.entity.tutanota.MailBody.prototype.ENCRYPTED = true;

/**
 * Provides the data of this instances as an object that can be converted to json.
 * @return {Object} The json object.
 */
tutao.entity.tutanota.MailBody.prototype.toJsonData = function() {
  return {
    _area: this.__area, 
    _format: this.__format, 
    _id: this.__id, 
    _owner: this.__owner, 
    _ownerEncSessionKey: this.__ownerEncSessionKey, 
    _ownerGroup: this.__ownerGroup, 
    _permissions: this.__permissions, 
    text: this._text
  };
};

/**
 * Provides the id of this MailBody.
 * @return {string} The id of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getId = function() {
  return this.__id;
};

/**
 * Sets the area of this MailBody.
 * @param {string} area The area of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setArea = function(area) {
  this.__area = area;
  return this;
};

/**
 * Provides the area of this MailBody.
 * @return {string} The area of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getArea = function() {
  return this.__area;
};

/**
 * Sets the format of this MailBody.
 * @param {string} format The format of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setFormat = function(format) {
  this.__format = format;
  return this;
};

/**
 * Provides the format of this MailBody.
 * @return {string} The format of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getFormat = function() {
  return this.__format;
};

/**
 * Sets the owner of this MailBody.
 * @param {string} owner The owner of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setOwner = function(owner) {
  this.__owner = owner;
  return this;
};

/**
 * Provides the owner of this MailBody.
 * @return {string} The owner of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getOwner = function() {
  return this.__owner;
};

/**
 * Sets the ownerEncSessionKey of this MailBody.
 * @param {string} ownerEncSessionKey The ownerEncSessionKey of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setOwnerEncSessionKey = function(ownerEncSessionKey) {
  this.__ownerEncSessionKey = ownerEncSessionKey;
  return this;
};

/**
 * Provides the ownerEncSessionKey of this MailBody.
 * @return {string} The ownerEncSessionKey of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getOwnerEncSessionKey = function() {
  return this.__ownerEncSessionKey;
};

/**
 * Sets the ownerGroup of this MailBody.
 * @param {string} ownerGroup The ownerGroup of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setOwnerGroup = function(ownerGroup) {
  this.__ownerGroup = ownerGroup;
  return this;
};

/**
 * Provides the ownerGroup of this MailBody.
 * @return {string} The ownerGroup of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getOwnerGroup = function() {
  return this.__ownerGroup;
};

/**
 * Sets the permissions of this MailBody.
 * @param {string} permissions The permissions of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setPermissions = function(permissions) {
  this.__permissions = permissions;
  return this;
};

/**
 * Provides the permissions of this MailBody.
 * @return {string} The permissions of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getPermissions = function() {
  return this.__permissions;
};

/**
 * Sets the text of this MailBody.
 * @param {string} text The text of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.setText = function(text) {
  var dataToEncrypt = text;
  this._text = tutao.locator.aesCrypter.encryptUtf8(this._entityHelper.getSessionKey(), dataToEncrypt);
  this._text_ = text;
  return this;
};

/**
 * Provides the text of this MailBody.
 * @return {string} The text of this MailBody.
 */
tutao.entity.tutanota.MailBody.prototype.getText = function() {
  if (this._text_ != null) {
    return this._text_;
  }
  if (this._text == "" || !this._entityHelper.getSessionKey()) {
    return "";
  }
  try {
    var value = tutao.locator.aesCrypter.decryptUtf8(this._entityHelper.getSessionKey(), this._text);
    this._text_ = value;
    return value;
  } catch (e) {
    if (e instanceof tutao.crypto.CryptoError) {
      this.getEntityHelper().invalidateSessionKey();
      return "";
    } else {
      throw e;
    }
  }
};

/**
 * Loads a MailBody from the server.
 * @param {string} id The id of the MailBody.
 * @return {Promise.<tutao.entity.tutanota.MailBody>} Resolves to the MailBody or an exception if the loading failed.
 */
tutao.entity.tutanota.MailBody.load = function(id) {
  return tutao.locator.entityRestClient.getElement(tutao.entity.tutanota.MailBody, tutao.entity.tutanota.MailBody.PATH, id, null, {"v" : "17"}, tutao.entity.EntityHelper.createAuthHeaders()).then(function(entity) {
    return entity._entityHelper.loadSessionKey();
  });
};

/**
 * Loads multiple MailBodys from the server.
 * @param {Array.<string>} ids The ids of the MailBodys to load.
 * @return {Promise.<Array.<tutao.entity.tutanota.MailBody>>} Resolves to an array of MailBody or rejects with an exception if the loading failed.
 */
tutao.entity.tutanota.MailBody.loadMultiple = function(ids) {
  return tutao.locator.entityRestClient.getElements(tutao.entity.tutanota.MailBody, tutao.entity.tutanota.MailBody.PATH, ids, {"v": "17"}, tutao.entity.EntityHelper.createAuthHeaders()).then(function(entities) {
    return tutao.entity.EntityHelper.loadSessionKeys(entities);
  });
};

/**
 * Updates the ownerEncSessionKey on the server.
 * @return {Promise.<>} Resolves when finished, rejected if the update failed.
 */
tutao.entity.tutanota.MailBody.prototype.updateOwnerEncSessionKey = function() {
  var params = {};
  params[tutao.rest.ResourceConstants.UPDATE_OWNER_ENC_SESSION_KEY] = "true";
  params["v"] = "17";
  return tutao.locator.entityRestClient.putElement(tutao.entity.tutanota.MailBody.PATH, this, params, tutao.entity.EntityHelper.createAuthHeaders());
};

/**
 * Updates this MailBody on the server.
 * @return {Promise.<>} Resolves when finished, rejected if the update failed.
 */
tutao.entity.tutanota.MailBody.prototype.update = function() {
  var self = this;
  return tutao.locator.entityRestClient.putElement(tutao.entity.tutanota.MailBody.PATH, this, {"v": "17"}, tutao.entity.EntityHelper.createAuthHeaders()).then(function() {
    self._entityHelper.notifyObservers(false);
  });
};

/**
 * Register a function that is called as soon as any attribute of the entity has changed. If this listener
 * was already registered it is not registered again.
 * @param {function(Object,*=)} listener. The listener function. When called it gets the entity and the given id as arguments.
 * @param {*=} id. An optional value that is just passed-through to the listener.
 */
tutao.entity.tutanota.MailBody.prototype.registerObserver = function(listener, id) {
  this._entityHelper.registerObserver(listener, id);
};

/**
 * Removes a registered listener function if it was registered before.
 * @param {function(Object)} listener. The listener to unregister.
 */
tutao.entity.tutanota.MailBody.prototype.unregisterObserver = function(listener) {
  this._entityHelper.unregisterObserver(listener);
};
/**
 * Provides the entity helper of this entity.
 * @return {tutao.entity.EntityHelper} The entity helper.
 */
tutao.entity.tutanota.MailBody.prototype.getEntityHelper = function() {
  return this._entityHelper;
};
