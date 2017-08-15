// @flow
import {px} from "./size"
import {assertMainOrNode} from "../api/Env"

assertMainOrNode()


export const noselect = {
	_webkit_touch_callout: 'none', /* iOS Safari */
	_webkit_user_select: 'none', /* Chrome/Safari/Opera */
	_khtml_user_select: 'none', /* Konqueror */
	_moz_user_select: 'none', /* Firefox */
	_ms_user_select: 'none', /* IE/Edge */
	user_select: 'none', /* non_prefixed version, currently not supported by any browser */
}

export function position_absolute(top: ?number, right: ?number, bottom: ?number, left: ?number) {
	return {
		position: 'absolute',
		top: positionValue(top),
		right: positionValue(right),
		bottom: positionValue(bottom),
		left: positionValue(left),
	}
}

export function positionValue(value: ?number) {
	if (value) {
		return px(value)
	} else if (value === 0) {
		return 0
	} else {
		return 'unset'
	}
}

export function flex(args: string) {
	return {
		_webkit_box_flex: args,
		_webkit_flex: args,
		_ms_flex: args,
		flex: args
	}
}


export const limit = {
	text_overflow: 'ellipsis',
	overflow: 'hidden',
	white_space: 'nowrap',
}

// We apply backface_visibility on all animated elements to increase animation performance on mobile devices
export const backface_fix = {
	_webkit_backface_visibility: 'hidden',
	backface_visibility: 'hidden',
}