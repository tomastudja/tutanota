"use strict";

tutao.provide('tutao.native.NotificationApp');

/**
 * @implements {tutao.native.NotificationInterface}
 */
tutao.native.NotificationApp = function(){
    this.currentId = 0;
    this.currentBadge = 0;
    setTimeout(function () {
        cordova.plugins.notification.badge.configure({title: tutao.locator.languageViewModel.get('newMailsBadge_msg'), autoClear: true});
    }, 100);
};

tutao.native.NotificationApp.prototype.add = function(message) {
    if (cordova.platformId == 'ios') {
        window.plugin.notification.local.add({ message: message, autoCancel: true});
    }
    navigator.notification.vibrate(300);
};

tutao.native.NotificationApp.prototype.updateBadge = function(number) {
    if (cordova.platformId == 'ios') {
        // on ios, the badge is always visible on the home screen
        cordova.plugins.notification.badge.set(number);
    } else {
        // on android, the badge is a part of the notification. The notification should be hidden, if the badge is zero or decreased
        if (number == 0 || number <= this.currentBadge) {
            cordova.plugins.notification.badge.clear();
        } else {
            cordova.plugins.notification.badge.set(number);
        }
    }
    this.currentBadge = number;
};
