//@flow

import m from "mithril"
import {formatEventTime, hasAlarmsForTheUser} from "../date/CalendarUtils"
import {CalendarEventBubble} from "./CalendarEventBubble"
import type {CalendarEvent} from "../../api/entities/tutanota/CalendarEvent"
import type {User} from "../../api/entities/sys/User"
import type {EventTextTimeOptionEnum} from "../../api/common/TutanotaConstants"
import type {CalendarEventBubbleClickHandler} from "./CalendarView"

type ContinuingCalendarEventBubbleAttrs = {|
	event: CalendarEvent,
	startsBefore: boolean,
	endsAfter: boolean,
	color: string,
	onEventClicked: CalendarEventBubbleClickHandler,
	showTime: ?EventTextTimeOptionEnum,
	user: User,
	fadeIn: boolean,
	opacity: number,
	enablePointerEvents: boolean
|}

export class ContinuingCalendarEventBubble implements MComponent<ContinuingCalendarEventBubbleAttrs> {

	view({attrs}: Vnode<ContinuingCalendarEventBubbleAttrs>): Children {
		return m(".flex.calendar-event-cont.darker-hover", [
			attrs.startsBefore
				? m(".event-continues-right-arrow", {
					style: {
						"border-left-color": "transparent",
						"border-top-color": "#" + attrs.color,
						"border-bottom-color": "#" + attrs.color,
						opacity: attrs.opacity,
					},
				})
				: null,
			m(".flex-grow.overflow-hidden",
				m(CalendarEventBubble, {
					text: (attrs.showTime != null ? formatEventTime(attrs.event, attrs.showTime) + " " : "") + attrs.event.summary,
					color: attrs.color,
					click: (e) => attrs.onEventClicked(attrs.event, e),
					noBorderLeft: attrs.startsBefore,
					noBorderRight: attrs.endsAfter,
					hasAlarm: hasAlarmsForTheUser(attrs.user, attrs.event),
					fadeIn: attrs.fadeIn,
					opacity: attrs.opacity,
					enablePointerEvents: attrs.enablePointerEvents
				}),
			),
			attrs.endsAfter
				? m(".event-continues-right-arrow", {
					style: {
						"border-left-color": "#" + attrs.color,
						opacity: attrs.opacity,
					}
				})
				: null,
		])
	}
}
