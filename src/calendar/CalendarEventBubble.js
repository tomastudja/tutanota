//@flow

import m from "mithril"
import {colorForBg} from "./CalendarUtils"
import {animations, opacity} from "../gui/animation/Animations"
import {px, size} from "../gui/size"

export type CalendarEventBubbleAttrs = {
	text: string,
	color: string,
	onEventClicked: clickHandler,
	height?: number,
	marginRight?: number,
	noBorderRight?: boolean,
	noBorderLeft?: boolean
}


const defaultBubbleHeight = size.calendar_line_height

export class CalendarEventBubble implements MComponent<CalendarEventBubbleAttrs> {

	view(vnode: Vnode<CalendarEventBubbleAttrs>): Children {
		const attrs = vnode.attrs
		return m(".calendar-event.small.overflow-hidden"
			+ (attrs.noBorderLeft ? ".event-continues-left" : "")
			+ (attrs.noBorderRight ? ".event-continues-right" : "")
			, {
				style: {
					background: "#" + attrs.color,
					color: colorForBg(attrs.color),
					opacity: '0',
					minHeight: px(defaultBubbleHeight),
					height: px(attrs.height ? attrs.height : defaultBubbleHeight),
					lineHeight: px(defaultBubbleHeight)
				},
				oncreate: (vnode) => animations.add(vnode.dom, opacity(0, 1, true)),
				onbeforeremove: (vnode) => animations.add(vnode.dom, opacity(1, 0, true)),
				onclick: (e) => {
					e.stopPropagation()
					attrs.onEventClicked(e)
				}
			}, attrs.text)
	}

}
