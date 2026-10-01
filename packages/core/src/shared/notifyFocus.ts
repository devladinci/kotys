export interface INotifyFocus {
  isVisible: boolean;
  hasFocus: boolean;
}

export interface INotifySubject {
  /** Present on a finished chat turn; reminders and pomodoro carry no chat. */
  chatId?: number;
}

/**
 * A visible page in a focused window means the user is looking at Kotys right
 * now — a banner for a reply they may be reading is noise. Reminders and
 * pomodoro carry no chatId and are the ones that must arrive regardless.
 */
export const shouldShowNotification = (
  subject: INotifySubject,
  focus: INotifyFocus,
): boolean =>
  subject.chatId === undefined || !(focus.isVisible && focus.hasFocus);
