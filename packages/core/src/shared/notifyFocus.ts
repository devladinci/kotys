export interface INotifyFocus {
  isVisible: boolean;
  hasFocus: boolean;
}

export interface INotifySubject {
  /** Present on a finished chat turn; reminders and pomodoro carry no chat. */
  chatId?: number;
}

/**
 * Only a chat reply can be suppressed: reminders and pomodoro carry no chatId
 * and must arrive regardless.
 */
export const shouldShowNotification = (
  subject: INotifySubject,
  focus: INotifyFocus,
): boolean =>
  subject.chatId === undefined || !(focus.isVisible && focus.hasFocus);
